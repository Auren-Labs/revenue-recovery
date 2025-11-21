"""
Enhanced Document Extraction with GPT-4o Augmentation
Combines Azure Document Intelligence with OpenAI GPT-4o for maximum accuracy
"""

from __future__ import annotations

import logging
import mimetypes
import json
import asyncio
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional
import re

from azure.ai.documentintelligence.aio import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import AzureError

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

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

CPI_DATE_PATTERN = re.compile(
    r"(?:effective\s+on|commence(?:s|d)?|start(?:s|ed)?)\s+(?P<date>\w+\s+\d{1,2},\s*\d{4})", re.IGNORECASE
)
PERCENT_PATTERN = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*%")
CURRENCY_PATTERN = re.compile(r"\b(?:USD|INR|EUR|GBP|\$|₹|€|£)\b")


# --- LLM Enhancement Layer ---

class GPT4oDocumentEnhancer:
    """Uses GPT-4o to enhance and validate document extraction on a per-job basis."""
    
    def __init__(self):
        self.enabled = False
        self.api_key = getattr(settings, "openai_api_key", None)
        if OpenAI and self.api_key:
            self.enabled = True
            logger.info("GPT-4o document enhancer enabled")
        else:
            logger.info("GPT-4o enhancer disabled (missing openai library or API key)")

    def _create_client(self) -> OpenAI | None:
        if not self.enabled or not self.api_key:
            return None
        try:
            return OpenAI(api_key=self.api_key)
        except Exception as exc:
            logger.warning("Failed to initialize GPT-4o client: %s", exc)
            return None
    
    async def extract_contract_terms(self, contract_text: str, filename: str) -> Dict[str, Any]:
        """
        Use GPT-4o to extract structured contract terms.
        This is MORE ACCURATE than regex patterns for complex contracts.
        """
        if not self.enabled or not contract_text:
            return {}
        
        client = self._create_client()
        if not client:
            return {}
        
        prompt = f"""You are analyzing a service contract to extract precise pricing and escalation terms.

CONTRACT FILENAME: {filename}

CONTRACT TEXT:
{contract_text[:15000]}

Extract the following information with HIGH PRECISION. Return ONLY valid JSON, no markdown:

{{
  "base_pricing": {{
    "amount": <number or null>,
    "currency": "<INR/USD/EUR/GBP or null>",
    "frequency": "<monthly/annual/quarterly or null>",
    "start_date": "<YYYY-MM-DD or null>",
    "description": "<brief service description>"
  }},
  "escalation": {{
    "type": "<fixed_percentage/cpi/negotiated or null>",
    "rate": <decimal (e.g., 0.05 for 5%) or null>,
    "effective_date": "<YYYY-MM-DD - CRITICAL - when escalation starts or null>",
    "trigger": "<anniversary/calendar_year/other or null>",
    "calculation_method": "<how is it calculated>",
    "cap": <number or null>
  }},
  "service_scope": {{
    "included_services": ["<list of services>"],
    "excluded_services": ["<one-time fees, setup costs, etc>"],
    "service_description": "<main service being provided>"
  }},
  "invoice_identifiers": {{
    "description_keywords": ["<words that appear in invoices>"],
    "typical_line_items": ["<expected invoice descriptions>"],
    "recurring_patterns": ["<monthly/annual charges>"],
    "one_time_patterns": ["<implementation/setup fees>"]
  }},
  "special_clauses": {{
    "sla_uptime": <percentage or null>,
    "service_credits": <boolean>,
    "service_credit_rate": <percentage or null>,
    "payment_terms": "<net 30, etc>",
    "renewal_notice_days": <number or null>
  }},
  "extraction_confidence": {{
    "overall": <0.0 to 1.0>,
    "base_pricing": <0.0 to 1.0>,
    "escalation": <0.0 to 1.0>,
    "reasoning": "<explain what you found and any ambiguities>"
  }}
}}

CRITICAL RULES:
1. For escalation effective_date, look for: "effective on", "commencing", "shall take effect", "anniversary"
2. For rates, convert percentages to decimals (5% → 0.05)
3. For dates, use YYYY-MM-DD format (January 1, 2025 → 2025-01-01)
4. Use null for missing information - DO NOT GUESS
5. Be extremely precise with the effective_date - this is used to audit invoices
6. Include ONLY the JSON in your response, no explanation text before or after"""

        loop = asyncio.get_running_loop()
        try:
            response = await loop.run_in_executor(
                None,
                lambda: client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a precise contract analyst. Always return valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.1,
                    max_tokens=2000,
                ),
            )
            response_text = response.choices[0].message.content.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            extracted_data = json.loads(response_text)
            logger.info(
                "GPT-4o extracted contract terms from %s (confidence: %.2f)",
                filename,
                extracted_data.get("extraction_confidence", {}).get("overall", 0),
            )
            return extracted_data
        except json.JSONDecodeError as exc:
            logger.error("GPT-4o returned invalid JSON: %s", exc)
            return {}
        except Exception as exc:
            logger.error("GPT-4o contract extraction failed: %s", exc)
            return {}
    
    async def validate_clause(
        self,
        clause_text: str,
        detected_label: str,
        context: str = ""
    ) -> Dict[str, Any]:
        """
        Use GPT-4o to validate and enhance clause detection.
        Helps catch false positives and extract precise values.
        """
        if not self.enabled:
            return {"validated": True, "confidence": 0.7}
        
        client = self._create_client()
        if not client:
            return {"validated": True, "confidence": 0.7}

        try:
            prompt = f"""You are validating a contract clause detection.

DETECTED CLAUSE TYPE: {detected_label}
CLAUSE TEXT: {clause_text}
{f"CONTEXT: {context}" if context else ""}

Validate if this clause is truly a "{detected_label}" clause and extract precise values.

Respond with ONLY valid JSON:
{{
  "is_valid": <boolean - is this really a {detected_label} clause?>,
  "confidence": <0.0 to 1.0>,
  "extracted_values": {{
    "percentage": <decimal or null>,
    "effective_date": "<YYYY-MM-DD or null>",
    "currency": "<INR/USD/etc or null>",
    "amount": <number or null>
  }},
  "reasoning": "<brief explanation>"
}}"""

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a precise contract clause validator. Always return valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            response_text = response.choices[0].message.content.strip()
            
            # Clean markdown
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            
            validation = json.loads(response_text)
            
            return validation
            
        except Exception as exc:
            logger.error("GPT-4o clause validation failed: %s", exc)
            return {"validated": True, "confidence": 0.5}
    
    async def extract_from_image(self, image_path: Path) -> str:
        """
        Use GPT-4o Vision to extract text from images/scanned PDFs.
        Useful when Azure OCR quality is poor.
        """
        if not self.enabled:
            return ""
        
        client = self._create_client()
        if not client:
            return ""

        try:
            import base64
            
            # Read and encode image
            with open(image_path, "rb") as image_file:
                image_data = base64.b64encode(image_file.read()).decode('utf-8')
            
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Extract ALL text from this document image. Maintain structure and formatting. Return only the extracted text."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=4000
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"GPT-4o vision extraction failed: {e}")
            return ""


# Initialize global enhancer
_gpt4o_enhancer = GPT4oDocumentEnhancer()


# --- Existing Azure Document Intelligence Functions (Enhanced) ---

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


async def _extract_clause_hits_enhanced(
    paragraphs: List[Any],
    page_meta: Dict[int, Dict[str, float]],
    full_text: str
) -> List[Dict[str, Any]]:
    """Enhanced clause extraction with GPT-4o validation."""
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
        
        # Basic regex extraction
        percentage = _extract_percentage(text)
        effective_date = _extract_date(text)
        currency = _extract_currency(text)
        
        # 🔥 NEW: Validate and enhance with GPT-4o
        validation = await _gpt4o_enhancer.validate_clause(
            clause_text=text,
            detected_label=label,
            context=full_text[max(0, full_text.find(text) - 200):full_text.find(text) + len(text) + 200]
        )
        
        # Use GPT-4o extracted values if they're better
        if validation.get("is_valid", True):
            extracted_values = validation.get("extracted_values", {})
            if extracted_values.get("percentage") and not percentage:
                percentage = extracted_values["percentage"]
            if extracted_values.get("effective_date") and not effective_date:
                effective_date = extracted_values["effective_date"]
            if extracted_values.get("currency") and not currency:
                currency = extracted_values["currency"]
        
        confidence = validation.get("confidence", 0.65)
        
        hits.append({
            "label": label,
            "text": text.strip(),
            "page": primary_region["page"] if primary_region else getattr(paragraph, "page_number", None),
            "confidence": float(confidence),
            "regions": normalized_regions,
            "percentage": percentage,
            "effective_date": effective_date,
            "currency": currency,
            "gpt4o_validated": validation.get("is_valid", False),
            "gpt4o_reasoning": validation.get("reasoning")
        })
    
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


async def _summarize_result_enhanced(result: Any, full_text: str) -> Dict[str, Any]:
    """Enhanced summarization with GPT-4o clause extraction."""
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
        key_pairs.append({
            "key": getattr(pair.key, "content", None) if getattr(pair, "key", None) else None,
            "value": getattr(pair.value, "content", None) if getattr(pair, "value", None) else None,
            "confidence": float(getattr(pair, "confidence", 0.0) or 0.0),
        })
    
    # 🔥 Enhanced clause extraction with GPT-4o
    clause_hits = await _extract_clause_hits_enhanced(
        getattr(result, "paragraphs", []) or [],
        page_meta,
        full_text
    )
    
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
        "full_text": full_text[:50000]  # Store for later GPT-4o analysis
    }


async def _analyze_document(client: DocumentIntelligenceClient, document_meta: Dict[str, Any]) -> Dict[str, Any]:
    """Enhanced document analysis with GPT-4o."""
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
    
    # Extract full text from result
    full_text = getattr(result, "content", "")
    if not full_text:
        # Fallback: concatenate paragraphs
        full_text = "\n".join(
            getattr(p, "content", "")
            for p in getattr(result, "paragraphs", []) or []
        )
    
    # Enhanced summarization with GPT-4o validation
    summary = await _summarize_result_enhanced(result, full_text)
    
    # 🔥 NEW: Extract structured contract terms with GPT-4o
    contract_terms = await _gpt4o_enhancer.extract_contract_terms(
        full_text,
        document_meta.get("filename", "")
    )
    
    summary["gpt4o_contract_terms"] = contract_terms
    summary["filename"] = document_meta.get("filename")
    summary["storage_path"] = document_meta.get("storage_path")
    summary["local_path"] = str(local_path)
    summary["storage"] = document_meta.get("storage")
    
    return summary


async def run(job, documents: List[Dict]) -> Dict:
    """Enhanced document extraction pipeline with GPT-4o."""
    await job_manager.simulate_latency(0.1)
    extracted_docs: List[Dict[str, Any]] = []

    if not documents:
        job.metrics["documents"] = []
        job.metrics["total_clauses"] = 0
        return {"clauses": 0, "documents": []}

    client = _create_client()
    if not client:
        logger.warning("Azure Document Intelligence credentials missing; falling back to GPT-4o-only extraction.")
        
        # 🔥 Fallback: Pure GPT-4o extraction
        for doc in documents:
            local_path = Path(doc.get("local_path", ""))
            if not local_path.exists():
                continue
            
            try:
                # Read document as text if possible
                if local_path.suffix.lower() in ['.txt', '.md']:
                    contract_text = local_path.read_text(encoding='utf-8')
                else:
                    # For PDFs, try basic extraction or use GPT-4o vision
                    try:
                        import PyPDF2
                        with open(local_path, 'rb') as f:
                            pdf_reader = PyPDF2.PdfReader(f)
                            contract_text = "\n".join(page.extract_text() for page in pdf_reader.pages)
                    except:
                        # Fallback to GPT-4o vision for images/scanned PDFs
                        contract_text = await _gpt4o_enhancer.extract_from_image(local_path)
                
                # Extract with GPT-4o
                contract_terms = await _gpt4o_enhancer.extract_contract_terms(
                    contract_text,
                    doc.get("filename", "")
                )
                
                extracted_docs.append({
                    "filename": doc.get("filename"),
                    "gpt4o_contract_terms": contract_terms,
                    "clauses": [],
                    "totals": {"clause_hits": 0},
                    "extraction_method": "gpt4o_only"
                })
            except Exception as e:
                logger.error(f"GPT-4o extraction failed for {doc.get('filename')}: {e}")
                extracted_docs.append({
                    "filename": doc.get("filename"),
                    "error": str(e),
                    "clauses": [],
                    "totals": {"clause_hits": 0}
                })
        
        total_clauses = 0
        job.metrics["documents"] = extracted_docs
        job.metrics["total_clauses"] = total_clauses
        job.metrics["extraction_method"] = "gpt4o_fallback"
        return {"clauses": total_clauses, "documents": extracted_docs}

    # Standard Azure + GPT-4o pipeline
    async with client:
        for document_meta in documents:
            try:
                summary = await _analyze_document(client, document_meta)
                extracted_docs.append(summary)
            except (AzureError, OSError) as exc:
                logger.exception("Document extraction failed for %s: %s", document_meta.get("filename"), exc)
                extracted_docs.append({
                    "filename": document_meta.get("filename"),
                    "error": str(exc),
                    "clauses": [],
                    "fields": {},
                    "totals": {"clause_hits": 0},
                })

    total_clauses = sum(doc.get("totals", {}).get("clause_hits", 0) for doc in extracted_docs)
    job.metrics["documents"] = extracted_docs
    job.metrics["total_clauses"] = total_clauses
    job.metrics["ocr_engine"] = "azure_document_intelligence"
    job.metrics["azure_model_id"] = settings.azure_afr_contract_model_id
    job.metrics["llm_enhancer"] = "gpt4o"
    
    return {"clauses": total_clauses, "documents": extracted_docs}