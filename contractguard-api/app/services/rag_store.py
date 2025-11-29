from __future__ import annotations

import asyncio
import json
import logging
import uuid as uuid_module
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


def _chunk_text(text: str, chunk_size: int = 1500, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks for better RAG retrieval."""
    if not text or len(text) <= chunk_size:
        return [text] if text else []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        
        # Try to break at sentence boundary if not at end
        if end < len(text):
            # Look for sentence endings in the last 100 chars
            last_period = chunk.rfind('.', -100)
            last_newline = chunk.rfind('\n', -100)
            break_point = max(last_period, last_newline)
            if break_point > start + chunk_size // 2:  # Only break if we're past halfway
                chunk = text[start:start + break_point + 1]
                start = start + break_point + 1 - overlap
            else:
                start = end - overlap
        else:
            start = end
        
        if chunk.strip():
            chunks.append(chunk.strip())
    
    return chunks


def _build_contract_chunks(job, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    for doc in documents or []:
        filename = doc.get("filename")
        
        # 1. Chunk individual clauses (high priority)
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
                "text": _truncate(text, limit=2000),
                "metadata": {
                    "page": clause.get("page"),
                    "confidence": clause.get("confidence"),
                    "bounds": region_bounds,
                    "regions": regions,  # Include full regions array for precise highlighting
                },
            }
            chunks.append(chunk)

        # 2. Chunk GPT-4o contract terms (structured data)
        terms = doc.get("gpt4o_contract_terms")
        if terms:
            terms_text = json.dumps(terms, indent=2) if isinstance(terms, dict) else str(terms)
            chunk = {
                "id": str(uuid4()),
                "job_id": job.id,
                "vendor": job.vendor_name,
                "source_type": "contract_summary",
                "filename": filename,
                "reference": "contract_terms",
                "text": _truncate(terms_text, limit=2000),
                "metadata": {},
            }
            chunks.append(chunk)
        
        # 3. Chunk full text if available (fallback for comprehensive coverage)
        full_text = doc.get("full_text", "")
        if full_text and full_text.strip():
            # Only chunk full text if we don't have many clauses (to avoid duplication)
            clause_count = len(doc.get("clauses") or [])
            if clause_count < 5:  # If few clauses detected, chunk full text
                text_chunks = _chunk_text(full_text, chunk_size=1500, overlap=200)
                for idx, text_chunk in enumerate(text_chunks):
                    chunk = {
                        "id": str(uuid4()),
                        "job_id": job.id,
                        "vendor": job.vendor_name,
                        "source_type": "contract_full_text",
                        "filename": filename,
                        "reference": f"full_text_chunk_{idx + 1}",
                        "text": _truncate(text_chunk, limit=2000),
                        "metadata": {
                            "chunk_index": idx,
                            "total_chunks": len(text_chunks),
                        },
                    }
                    chunks.append(chunk)
            elif clause_count == 0:
                # If no clauses at all, definitely chunk full text
                text_chunks = _chunk_text(full_text, chunk_size=1500, overlap=200)
                for idx, text_chunk in enumerate(text_chunks):
                    chunk = {
                        "id": str(uuid4()),
                        "job_id": job.id,
                        "vendor": job.vendor_name,
                        "source_type": "contract_full_text",
                        "filename": filename,
                        "reference": f"full_text_chunk_{idx + 1}",
                        "text": _truncate(text_chunk, limit=2000),
                        "metadata": {
                            "chunk_index": idx,
                            "total_chunks": len(text_chunks),
                        },
                    }
                    chunks.append(chunk)
    
    logger.info(f"Built {len(chunks)} chunks from {len(documents)} documents for job {job.id}")
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
        logger.warning("RAG store not ready, skipping contract indexing for job %s. Embedding client: %s, Supabase URL: %s, Supabase key: %s", 
                      job.id, bool(_embedding_client), bool(settings.supabase_url), bool(settings.supabase_service_key))
        return
    
    if not documents:
        logger.warning("No documents provided for indexing job %s", job.id)
        return
    
    # Log document structure for debugging
    logger.info("Indexing contracts for job %s: %d documents", job.id, len(documents))
    for doc in documents[:3]:  # Log first 3 documents
        logger.debug("Document structure: filename=%s, has_clauses=%s, has_terms=%s, has_full_text=%s, clause_count=%d",
                    doc.get("filename"),
                    bool(doc.get("clauses")),
                    bool(doc.get("gpt4o_contract_terms")),
                    bool(doc.get("full_text")),
                    len(doc.get("clauses") or []))
    
    chunks = await asyncio.to_thread(_build_contract_chunks, job, documents)
    if not chunks:
        logger.warning("No contract chunks generated for job %s from %d documents. Check if documents have clauses, terms, or full_text", 
                      job.id, len(documents))
        return

    logger.info("Indexing %d contract chunks for job %s", len(chunks), job.id)
    def _process():
        embedded = _apply_embeddings(chunks)
        if not embedded:
            logger.warning("Failed to generate embeddings for %d chunks. Check OpenAI API key and rate limits", len(chunks))
            return
        logger.info("Storing %d embedded chunks in %s for job %s", len(embedded), settings.rag_contract_table, job.id)
        _index_records(settings.rag_contract_table, embedded)
        logger.info("Successfully indexed %d contract chunks for job %s", len(embedded), job.id)

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
    # Validate job_id is a valid UUID to prevent SQL injection
    try:
        uuid_module.UUID(job_id)
    except (ValueError, AttributeError):
        logger.error(f"Invalid job_id format: {job_id}")
        return []
    
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
    # Validate job_id is a valid UUID
    try:
        uuid_module.UUID(job_id)
    except (ValueError, AttributeError):
        logger.error(f"Invalid job_id format in query_context: {job_id}")
        return []
    
    if not question.strip():
        logger.warning("Empty question provided to query_context")
        return []
    
    if not _is_ready():
        logger.warning(f"RAG store not ready for job {job_id}. Embedding client: {bool(_embedding_client)}, Supabase URL: {bool(settings.supabase_url)}, Supabase key: {bool(settings.supabase_service_key)}")
        return []

    def _search() -> List[Dict[str, Any]]:
        question_embedding = _embed_texts([question])
        if not question_embedding:
            logger.warning("Failed to generate embedding for question: %s", question[:100])
            return []
        q_vector = question_embedding[0]
        logger.info("Generated question embedding with dimension %d", len(q_vector))
        
        # Fetch all rows and compute similarity in Python
        # TODO: Optimize with native pgvector SQL query when Supabase supports it
        contract_rows = _fetch_rows(settings.rag_contract_table, job_id)
        billing_rows = _fetch_rows(settings.rag_billing_table, job_id)
        logger.info("Found %d contract chunks and %d billing chunks for job %s", 
                   len(contract_rows), len(billing_rows), job_id)
        
        rows = contract_rows + billing_rows
        if not rows:
            logger.warning("No chunks found in database for job %s. Check if indexing completed successfully.", job_id)
            return []
        
        # Debug: Check embedding format
        embedding_sample = rows[0].get("embedding") if rows else None
        logger.info("Sample embedding type: %s, is_list: %s, length: %s", 
                   type(embedding_sample), isinstance(embedding_sample, list),
                   len(embedding_sample) if isinstance(embedding_sample, list) else "N/A")
        
        scored: List[Tuple[float, Dict[str, Any]]] = []
        skipped_count = 0
        for row in rows:
            embedding = row.get("embedding")
            
            # Handle different embedding formats
            if embedding is None:
                skipped_count += 1
                continue
                
            # Supabase might return embeddings as strings or lists
            if isinstance(embedding, str):
                try:
                    # Try to parse as JSON array
                    import json
                    embedding = json.loads(embedding)
                except:
                    logger.debug("Could not parse embedding string: %s", embedding[:50] if embedding else None)
                    skipped_count += 1
                    continue
            
            if not isinstance(embedding, list):
                logger.debug("Skipping row with invalid embedding type: %s", type(embedding))
                skipped_count += 1
                continue
                
            if len(embedding) != len(q_vector):
                logger.debug("Embedding dimension mismatch: %d vs %d", len(embedding), len(q_vector))
                skipped_count += 1
                continue
                
            score = _cosine_similarity(q_vector, embedding)
            if score <= 0:
                skipped_count += 1
                continue
            scored.append((score, row))
        
        if skipped_count > 0:
            logger.warning("Skipped %d rows due to invalid embeddings out of %d total rows", skipped_count, len(rows))
        
        scored.sort(key=lambda item: item[0], reverse=True)
        
        logger.info("Found %d scored results (similarity > 0), returning top %d", 
                   len(scored), min(top_k, len(scored)))
        
        if not scored:
            logger.warning("No chunks passed similarity threshold. All similarities were <= 0.")
            # Return top chunks anyway with low similarity for debugging
            for row in rows[:top_k]:
                embedding = row.get("embedding")
                if isinstance(embedding, list) and len(embedding) == len(q_vector):
                    score = _cosine_similarity(q_vector, embedding)
                    scored.append((max(score, 0.01), row))  # Force minimum score for debugging
            scored.sort(key=lambda item: item[0], reverse=True)
        
        results = []
        for score, row in scored[:top_k]:
            metadata = row.get("metadata") or {}
            # Ensure filename is included in metadata if available
            if row.get("filename") and "filename" not in metadata:
                metadata["filename"] = row.get("filename")
            # Ensure regions are preserved in metadata (they might be stored as JSON string)
            if "regions" in metadata and isinstance(metadata["regions"], str):
                try:
                    import json
                    metadata["regions"] = json.loads(metadata["regions"])
                except (json.JSONDecodeError, TypeError):
                    pass  # Keep as is if parsing fails
            results.append(
                {
                    "text": row.get("text") or "",
                    "source_type": row.get("source_type"),
                    "reference": row.get("reference") or row.get("filename"),
                    "filename": row.get("filename"),  # Include filename directly
                    "metadata": metadata,
                    "similarity": score,
                }
            )
        
        logger.info("Returning %d results with similarities: %s", 
                   len(results), [r["similarity"] for r in results])
        return results

    return await asyncio.to_thread(_search)

