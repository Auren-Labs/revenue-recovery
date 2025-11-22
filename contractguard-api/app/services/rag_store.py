from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Tuple
from uuid import uuid4

from app.config import get_settings
from app.services.storage_supabase import get_client as get_supabase_client

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

logger = logging.getLogger(__name__)
settings = get_settings()

_embedding_client = None
if OpenAI and settings.openai_api_key:
    try:
        _embedding_client = OpenAI(api_key=settings.openai_api_key)
    except Exception as exc:
        logger.warning("Failed to initialize OpenAI embedding client: %s", exc)


def _is_ready() -> bool:
    return bool(_embedding_client and settings.supabase_url and settings.supabase_service_key)


def _batched(items: List[Any], size: int) -> List[List[Any]]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def _truncate(text: str, limit: int = 1800) -> str:
    return text if len(text) <= limit else text[:limit] + "..."


def _embed_texts(texts: List[str]) -> List[List[float]]:
    if not texts or not _embedding_client:
        return []
    embeddings: List[List[float]] = []
    for batch in _batched(texts, 50):
        try:
            response = _embedding_client.embeddings.create(
                model=settings.openai_embedding_model,
                input=batch,
            )
            embeddings.extend([item.embedding for item in response.data])
        except Exception as exc:
            logger.error("Embedding batch failed: %s", exc)
    return embeddings


def _index_records(table: str, records: List[Dict[str, Any]]) -> None:
    if not records:
        return
    supabase = get_supabase_client()
    if not supabase:
        logger.debug("Supabase client unavailable; skipping RAG indexing.")
        return
    for batch in _batched(records, 50):
        try:
            supabase.table(table).upsert(batch).execute()
        except Exception as exc:
            logger.error("Failed to upsert %s records into %s: %s", len(batch), table, exc)


def _build_contract_chunks(job, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    for doc in documents or []:
        filename = doc.get("filename")
        for clause in doc.get("clauses") or []:
            text = (clause.get("text") or "").strip()
            if not text:
                continue
            regions = clause.get("regions") or []
            region_bounds = None
            if regions:
                first_region = regions[0]
                if isinstance(first_region, dict):
                    region_bounds = first_region.get("bounds")
            chunk = {
                "id": str(uuid4()),
                "job_id": job.id,
                "vendor": job.vendor_name,
                "source_type": "contract_clause",
                "filename": filename,
                "reference": clause.get("label"),
                "text": _truncate(text),
                "metadata": {
                    "page": clause.get("page"),
                    "confidence": clause.get("confidence"),
                    "bounds": region_bounds,
                },
            }
            chunks.append(chunk)

        terms = doc.get("gpt4o_contract_terms")
        if terms:
            chunk = {
                "id": str(uuid4()),
                "job_id": job.id,
                "vendor": job.vendor_name,
                "source_type": "contract_summary",
                "filename": filename,
                "reference": "contract_terms",
                "text": _truncate(json.dumps(terms, indent=2)),
                "metadata": {},
            }
            chunks.append(chunk)
    return chunks


def _build_billing_chunks(job, discrepancies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    for discrepancy in discrepancies or []:
        evidence_lines = []
        for evidence in discrepancy.get("evidence") or []:
            if evidence.get("type") == "contract_clause":
                continue
            evidence_lines.append(
                f"Invoice {evidence.get('reference')} on {evidence.get('invoice_date')} billed {evidence.get('found_rate')} "
                f"vs expected {evidence.get('expected_rate')} (leakage {evidence.get('leakage_amount')})."
            )
        text = (
            f"{discrepancy.get('issue', 'Discrepancy')} for {discrepancy.get('customer', 'Unknown customer')} "
            f"worth {discrepancy.get('value', 0)}.\n"
            + "\n".join(evidence_lines[:4])
        )
        chunk = {
            "id": str(uuid4()),
            "job_id": job.id,
            "vendor": job.vendor_name,
            "source_type": "billing_discrepancy",
            "reference": discrepancy.get("customer"),
            "text": _truncate(text),
            "metadata": {
                "due": discrepancy.get("due"),
                "priority": discrepancy.get("priority"),
                "recommended_action": discrepancy.get("recommended_action"),
            },
        }
        chunks.append(chunk)
    return chunks


def _apply_embeddings(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    texts = [chunk["text"] for chunk in chunks]
    embeddings = _embed_texts(texts)
    if len(embeddings) != len(chunks):
        logger.warning("Embedding count mismatch; skipping vector store update.")
        return []
    for chunk, embedding in zip(chunks, embeddings):
        chunk["embedding"] = embedding
    return chunks


async def index_contracts(job, documents: List[Dict[str, Any]]) -> None:
    if not _is_ready():
        return
    chunks = await asyncio.to_thread(_build_contract_chunks, job, documents)
    if not chunks:
        return

    def _process():
        embedded = _apply_embeddings(chunks)
        _index_records(settings.rag_contract_table, embedded)

    await asyncio.to_thread(_process)


async def index_billing(job, discrepancies: List[Dict[str, Any]]) -> None:
    if not _is_ready():
        return
    chunks = await asyncio.to_thread(_build_billing_chunks, job, discrepancies)
    if not chunks:
        return

    def _process():
        embedded = _apply_embeddings(chunks)
        _index_records(settings.rag_billing_table, embedded)

    await asyncio.to_thread(_process)


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _fetch_rows(table: str, job_id: str) -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    if not supabase:
        return []
    try:
        response = supabase.table(table).select("*").eq("job_id", job_id).limit(500).execute()
        return response.data or []
    except Exception as exc:
        logger.error("Failed to fetch rows from %s: %s", table, exc)
        return []


async def query_context(job_id: str, question: str, top_k: int = 4) -> List[Dict[str, Any]]:
    if not _is_ready() or not question.strip():
        return []

    def _search() -> List[Dict[str, Any]]:
        question_embedding = _embed_texts([question])
        if not question_embedding:
            return []
        q_vector = question_embedding[0]
        rows = _fetch_rows(settings.rag_contract_table, job_id) + _fetch_rows(settings.rag_billing_table, job_id)
        scored: List[Tuple[float, Dict[str, Any]]] = []
        for row in rows:
            embedding = row.get("embedding")
            if not isinstance(embedding, list):
                continue
            score = _cosine_similarity(q_vector, embedding)
            if score <= 0:
                continue
            scored.append((score, row))
        scored.sort(key=lambda item: item[0], reverse=True)
        results = []
        for score, row in scored[:top_k]:
            results.append(
                {
                    "text": row.get("text"),
                    "source_type": row.get("source_type"),
                    "reference": row.get("reference") or row.get("filename"),
                    "metadata": row.get("metadata"),
                    "similarity": score,
                }
            )
        return results

    return await asyncio.to_thread(_search)

