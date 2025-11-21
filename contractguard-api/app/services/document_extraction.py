from __future__ import annotations

import logging
import mimetypes
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional
import re

from azure.ai.documentintelligence.aio import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import AzureError

from app.config import get_settings
from app.services import job_manager

logger = logging.getLogger(__name__)
settings = get_settings()

_CLAUSE_KEYWORDS: Dict[str, Dict[str, Any]] = {
    "cpi_uplift": {
        "keywords": ["cpi", "consumer price", "annual increase", "escalat", "uplift", "inflation"],
        "context": ["percentage", "increase", "anniversary", "senior", "year", "effective"],
    },
    "discount_floor": {"keywords": ["discount", "rebate", "markdown"], "context": ["floor", "minimum", "base"]},
    "renewal_notice": {"keywords": ["renewal", "terminate", "expiration", "notice period"], "context": []},
    "service_credits": {"keywords": ["service credit", "credit", "sla", "uptime", "downtime"], "context": []},
    "billing_cap": {"keywords": ["cap", "not exceed", "maximum fee", "spend cap"], "context": []},
}


def _create_client() -> DocumentIntelligenceClient | None:
    if not settings.azure_afr_endpoint or not settings.azure_afr_api_key:
        return None
    credential = AzureKeyCredential(settings.azure_afr_api_key)
    return DocumentIntelligenceClient(endpoint=settings.azure_afr_endpoint, credential=credential)


def _guess_content_type(path: Path) -> str:
    mime_type, _ = mimetypes.guess_type(str(path))
    return mime_type or "application/octet-stream"


def _match_clause_label(text: str) -> Tuple[str | None, Dict[str, Any]]:
    lowered = text.lower()
    for label, config in _CLAUSE_KEYWORDS.items():
        if any(keyword in lowered for keyword in config.get("keywords", [])):
            return label, config
    return None


CPI_DATE_PATTERN = re.compile(
    r"(?:effective\s+on|commence(?:s|d)?|start(?:s|ed)?)\s+(?P<date>\w+\s+\d{1,2},\s*\d{4})", re.IGNORECASE
)
PERCENT_PATTERN = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*%")
CURRENCY_PATTERN = re.compile(r"\b(?:USD|INR|EUR|GBP|\$|₹|€|£)\b")


def _extract_percentage(text: str) -> Optional[float]:
    match = PERCENT_PATTERN.search(text)
    if match:
        try:
            return float(match.group(1)) / 100.0
        except ValueError:
            return None
    return None


def _extract_date(text: str) -> Optional[str]:
    match = CPI_DATE_PATTERN.search(text)
    if match:
        return match.group("date")
    return None


def _extract_currency(text: str) -> Optional[str]:
    match = CURRENCY_PATTERN.search(text)
    if match:
        symbol = match.group(0).upper()
        if symbol in {"$", "USD"}:
            return "USD"
        if symbol in {"₹", "INR"}:
            return "INR"
        if symbol in {"€", "EUR"}:
            return "EUR"
        if symbol in {"£", "GBP"}:
            return "GBP"
        return symbol
    return None


def _coerce_field_value(field: Any) -> Any:
    for attr in ("value", "value_string", "value_number", "value_currency", "value_date", "content"):
        if hasattr(field, attr):
            value = getattr(field, attr)
            if value not in (None, ""):
                if isinstance(value, (datetime, date)):
                    return value.isoformat()
                return value
    return None


def _build_page_map(result: Any) -> Dict[int, Dict[str, float]]:
    pages_meta: Dict[int, Dict[str, float]] = {}
    for page in getattr(result, "pages", []) or []:
        page_number = getattr(page, "page_number", None)
        if page_number is None:
            continue
        pages_meta[page_number] = {
            "width": float(getattr(page, "width", 1.0) or 1.0),
            "height": float(getattr(page, "height", 1.0) or 1.0),
            "unit": getattr(page, "unit", None),
        }
    return pages_meta


def _normalize_region(region: Any, page_meta: Dict[str, float] | None) -> Dict[str, Any]:
    page_number = getattr(region, "page_number", None)
    polygon = getattr(region, "polygon", None)
    normalized_polygon: List[Dict[str, float]] | None = None
    bounds: Dict[str, float] | None = None
    if polygon and page_meta:
        points: List[Tuple[float, float]] = list(zip(polygon[0::2], polygon[1::2]))
        width = page_meta.get("width") or 1.0
        height = page_meta.get("height") or 1.0
        if points:
            normalized_polygon = [{"x": x / width, "y": y / height} for x, y in points]
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            bounds = {
                "x": min_x / width,
                "y": min_y / height,
                "width": (max_x - min_x) / width,
                "height": (max_y - min_y) / height,
            }
    return {"page": page_number, "polygon": polygon, "normalized_polygon": normalized_polygon, "bounds": bounds}


def _extract_clause_hits(paragraphs: List[Any], page_meta: Dict[int, Dict[str, float]]) -> List[Dict[str, Any]]:
    hits: List[Dict[str, Any]] = []
    for paragraph in paragraphs or []:
        text = getattr(paragraph, "content", "")
        if not text:
            continue
        match = _match_clause_label(text)
        if not match:
            continue
        label, config = match
        regions_raw = getattr(paragraph, "bounding_regions", None) or []
        normalized_regions = [
            _normalize_region(region, page_meta.get(getattr(region, "page_number", None)))
            for region in regions_raw
        ]
        primary_region = normalized_regions[0] if normalized_regions else None
        percentage = None
        effective_date = None
        currency = None
        if label == "cpi_uplift":
            percentage = _extract_percentage(text) if (percentage := _extract_percentage(text)) is not None else None
            effective_date = _extract_date(text)
        currency = _extract_currency(text)
        hits.append(
            {
                "label": label,
                "text": text.strip(),
                "page": primary_region["page"] if primary_region else getattr(paragraph, "page_number", None),
                "confidence": float(getattr(paragraph, "confidence", 0.65) or 0.65),
                "regions": normalized_regions,
                "percentage": percentage,
                "effective_date": effective_date,
                "currency": currency,
            }
        )
    return hits


def _normalize_table(table: Any) -> Dict[str, Any]:
    rows = int(getattr(table, "row_count", 0) or 0)
    cols = int(getattr(table, "column_count", 0) or 0)
    grid: List[List[str | None]] = [[None for _ in range(cols)] for _ in range(rows)]
    for cell in (getattr(table, "cells", None) or []):
        row_idx = getattr(cell, "row_index", 0) or 0
        col_idx = getattr(cell, "column_index", 0) or 0
        if row_idx < rows and col_idx < cols:
            grid[row_idx][col_idx] = getattr(cell, "content", None)
    header = grid[0] if grid else []
    data = grid[1:] if len(grid) > 1 else []
    page_number = None
    bounding_regions = getattr(table, "bounding_regions", None) or []
    if bounding_regions:
        page_number = getattr(bounding_regions[0], "page_number", None)
    return {
        "header": header,
        "rows": data,
        "page": page_number,
    }


def _summarize_result(result: Any) -> Dict[str, Any]:
    page_meta = _build_page_map(result)
    doc_fields: Dict[str, Dict[str, Any]] = {}
    for document in getattr(result, "documents", []) or []:
        for name, field in (getattr(document, "fields", {}) or {}).items():
            doc_fields[name] = {
                "value": _coerce_field_value(field),
                "confidence": float(getattr(field, "confidence", 0.0) or 0.0),
            }
    key_pairs = []
    for pair in getattr(result, "key_value_pairs", []) or []:
        key_pairs.append(
            {
                "key": getattr(pair.key, "content", None) if getattr(pair, "key", None) else None,
                "value": getattr(pair.value, "content", None) if getattr(pair, "value", None) else None,
                "confidence": float(getattr(pair, "confidence", 0.0) or 0.0),
            }
        )
    clause_hits = _extract_clause_hits(getattr(result, "paragraphs", []) or [], page_meta)
    tables = [_normalize_table(table) for table in (getattr(result, "tables", []) or [])[:3]]
    totals = {
        "page_count": len(getattr(result, "pages", []) or []),
        "clause_hits": len(clause_hits),
        "word_count": sum(len((getattr(p, "content", "") or "").split()) for p in getattr(result, "paragraphs", []) or []),
    }
    return {
        "fields": doc_fields,
        "key_pairs": key_pairs[:25],
        "clauses": clause_hits,
        "tables": tables,
        "totals": totals,
    }


async def _analyze_document(client: DocumentIntelligenceClient, document_meta: Dict[str, Any]) -> Dict[str, Any]:
    local_path = Path(document_meta.get("local_path", ""))
    if not local_path.exists():
        raise FileNotFoundError(local_path)
    content_type = _guess_content_type(local_path)
    document_bytes = local_path.read_bytes()
    poller = await client.begin_analyze_document(
        model_id=settings.azure_afr_contract_model_id,
        body=document_bytes,
        content_type=content_type,
        features=["ocrHighResolution"],
        output_content_format="markdown",
    )
    result = await poller.result()
    summary = _summarize_result(result)
    summary["filename"] = document_meta.get("filename")
    summary["storage_path"] = document_meta.get("storage_path")
    summary["local_path"] = str(local_path)
    summary["storage"] = document_meta.get("storage")
    return summary


async def run(job, documents: List[Dict]) -> Dict:
    await job_manager.simulate_latency(0.1)
    extracted_docs: List[Dict[str, Any]] = []

    if not documents:
        job.metrics["documents"] = []
        job.metrics["total_clauses"] = 0
        return {"clauses": 0, "documents": []}

    client = _create_client()
    if not client:
        logger.warning("Azure Document Intelligence credentials missing; falling back to heuristic extraction.")
        clause_count = 0
        for doc in documents:
            fallback = {"filename": doc.get("filename"), "clauses": [], "totals": {"clause_hits": 0}}
            extracted_docs.append(fallback)
        job.metrics["documents"] = extracted_docs
        job.metrics["total_clauses"] = clause_count
        return {"clauses": clause_count, "documents": extracted_docs}

    async with client:
        for document_meta in documents:
            try:
                summary = await _analyze_document(client, document_meta)
                extracted_docs.append(summary)
            except (AzureError, OSError) as exc:
                logger.exception("Document extraction failed for %s: %s", document_meta.get("filename"), exc)
                extracted_docs.append(
                    {
                        "filename": document_meta.get("filename"),
                        "error": str(exc),
                        "clauses": [],
                        "fields": {},
                        "totals": {"clause_hits": 0},
                    }
                )

    total_clauses = sum(doc.get("totals", {}).get("clause_hits", 0) for doc in extracted_docs)
    job.metrics["documents"] = extracted_docs
    job.metrics["total_clauses"] = total_clauses
    job.metrics["ocr_engine"] = "azure_document_intelligence"
    job.metrics["azure_model_id"] = settings.azure_afr_contract_model_id
    return {"clauses": total_clauses, "documents": extracted_docs}


