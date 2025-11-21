from __future__ import annotations

import csv
import logging
from datetime import date, datetime, time
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Tuple

try:
    import openpyxl  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    openpyxl = None

from app.services import job_manager

logger = logging.getLogger(__name__)

# --- CONFIGURATION & CONSTANTS ---
# Keywords to identify recurring fees (vs one-time implementation fees)
# 🔧 FIXED: Added missing keywords that are common in service descriptions
AUDIT_TARGET_KEYWORDS = [
    "saas", "platform", "license", "subscription", "recurring", "maintenance",
    "cloud", "infrastructure", "management", "services", "hosting", "support", "monthly"
]

# 🔧 NEW: Exclusion keywords to filter out one-time charges
EXCLUSION_KEYWORDS = [
    "one-time", "implementation", "setup", "onboarding", "initial", "migration", "installation"
]

_AMOUNT_FIELDS = ["amount", "Amount", "value", "Value", "total", "Total", "charge", "Charge", "billed", "Billed"]
_CUSTOMER_FIELDS = ["Customer", "customer", "Account", "account", "Client", "client", "Company", "company", "Name"]
_INVOICE_DATE_FIELDS = ["Invoice_Date", "invoice_date", "Date", "date", "InvoiceDate"]
_INVOICE_FIELDS = ["InvoiceNumber", "invoiceNumber", "Invoice", "invoice", "Number", "number", "Id", "ID"]
_PERIOD_START_FIELDS = ["BillingPeriodStart", "StartDate", "Start", "PeriodStart"]
_PERIOD_END_FIELDS = ["BillingPeriodEnd", "EndDate", "End", "PeriodEnd"]
_DESC_FIELDS = ["Item_Desc", "item_desc", "Description", "description", "Memo", "memo", "Activity"]
_RATE_FIELDS = ["Rate", "rate", "Unit Price", "unit_price", "Price"]


# --- HELPER FUNCTIONS ---

def _to_float(value: Any) -> float:
    if value in (None, "", "NA"):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0

def _extract_field(row: Dict, choices: List[str]) -> Any:
    """Generic helper to find the first matching field from a list of choices."""
    for field in choices:
        if field in row:
            return row[field]
    return None

def _parse_date(value: Any) -> date | None:
    """Robust date parser handling ISO, US, and EU formats."""
    if not value:
        return None
    text = str(value).strip()
    # Try common formats
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    # Fallback for ISO strings
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        pass
    return None

def _extract_amount(row: Dict[str, Any]) -> float:
    val = _extract_field(row, _AMOUNT_FIELDS)
    return _to_float(val)

def _extract_customer(row: Dict[str, Any]) -> str | None:
    val = _extract_field(row, _CUSTOMER_FIELDS)
    return str(val).strip() if val else None

def _extract_invoice_number(row: Dict[str, Any]) -> str | None:
    val = _extract_field(row, _INVOICE_FIELDS)
    return str(val).strip() if val else None

def _extract_period(row: Dict[str, Any]) -> str | None:
    start = _extract_field(row, _PERIOD_START_FIELDS)
    end = _extract_field(row, _PERIOD_END_FIELDS)
    if start and end:
        return f"{start} → {end}"
    return str(start or end) if (start or end) else None

def _extract_invoice_date(row: Dict[str, Any]) -> date | None:
    val = _extract_field(row, _INVOICE_DATE_FIELDS)
    return _parse_date(val)

def _read_csv(path: Path, delimiter: str = ",") -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        for raw in reader:
            sanitized = {key.strip(): value for key, value in raw.items() if key}
            sanitized["__source_file"] = path.name
            rows.append(sanitized)
    return rows

def _read_excel(path: Path) -> List[Dict[str, Any]]:
    if not openpyxl:
        logger.warning("openpyxl not installed; skipping Excel file %s", path.name)
        return []
    workbook = openpyxl.load_workbook(path, data_only=True)
    sheet = workbook.active
    rows: List[Dict[str, Any]] = []
    header_row = next(sheet.iter_rows(min_row=1, max_row=1), None)
    if not header_row:
        return rows
    
    headers = [str(cell.value).strip() if cell.value is not None else f"column_{idx}" for idx, cell in enumerate(header_row, start=1)]
    
    for excel_row in sheet.iter_rows(min_row=2, values_only=True):
        record = {}
        if excel_row:
            for idx in range(min(len(headers), len(excel_row))):
                val = excel_row[idx]
                # Normalize dates/times to strings
                if isinstance(val, (datetime, date)):
                    val = val.isoformat()
                elif isinstance(val, time):
                    val = val.strftime("%H:%M:%S")
                record[headers[idx]] = val
        record["__source_file"] = path.name
        rows.append(record)
    return rows

def _load_billing_rows(job) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for document in job.billing_records:
        local_path = Path(document.get("local_path", ""))
        if not local_path.exists():
            continue
        suffix = local_path.suffix.lower()
        if suffix == ".csv":
            rows.extend(_read_csv(local_path, delimiter=","))
        elif suffix == ".tsv":
            rows.extend(_read_csv(local_path, delimiter="\t"))
        elif suffix in (".xlsx", ".xlsm", ".xls"):
            rows.extend(_read_excel(local_path))
    return rows

def _summarize_billing(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    amounts: List[float] = []
    customer_totals: Dict[str, List[float]] = {}
    
    for row in rows:
        amount = _extract_amount(row)
        if amount == 0.0:
            continue
        amounts.append(amount)
        customer = _extract_customer(row) or "Unspecified"
        customer_totals.setdefault(customer, []).append(amount)
        
    customers_summary = [
        {
            "customer": c,
            "total": round(sum(v), 2),
            "invoice_count": len(v),
            "avg_invoice": round(mean(v), 2),
        }
        for c, v in customer_totals.items()
    ]
    customers_summary.sort(key=lambda item: item["total"], reverse=True)
    
    return {
        "total_billed": round(sum(amounts), 2),
        "invoice_count": len(amounts),
        "avg_invoice": round(mean(amounts), 2) if amounts else 0.0,
        "largest_invoice": max(amounts) if amounts else 0.0,
        "customers": customers_summary,
        "sources": sorted({row.get("__source_file") for row in rows if row.get("__source_file")}),
    }

def _find_clause(documents: List[Dict[str, Any]] | None, label: str) -> Dict[str, Any] | None:
    """Helper to grab extraction confidence/text from metrics."""
    if not documents:
        return None
    for doc in documents:
        for clause in doc.get("clauses", []) or []:
            if clause.get("label") == label:
                return clause
    return None

def _clause_references(documents: List[Dict[str, Any]] | None, label: str, limit: int = 2) -> List[Dict[str, Any]]:
    """Formats contract evidence for the report."""
    references: List[Dict[str, Any]] = []
    if not documents:
        return references
    for doc in documents:
        for clause in doc.get("clauses", []) or []:
            if clause.get("label") == label:
                references.append({
                    "type": "contract_clause",
                    "label": label,
                    "text": clause.get("text"),
                    "file": doc.get("filename"),
                    "confidence": clause.get("confidence"),
                })
                if len(references) >= limit:
                    return references
    return references


# --- CORE LOGIC: THE DETERMINISTIC AUDIT ---

def _audit_line_item(row: Dict[str, Any], rules: Dict[str, Any]) -> Dict[str, Any] | None:
    """
    Performs the Three-Way Match:
    1. Scope Check (Keywords)
    2. Date Check (Effective Date)
    3. Math Check (Rate vs Expected)
    """
    # A. Extract Data
    inv_date = _extract_invoice_date(row)
    description = str(_extract_field(row, _DESC_FIELDS) or "").lower()
    amount = _extract_amount(row)
    rate = _to_float(_extract_field(row, _RATE_FIELDS))
    
    # Fallback: if no explicit rate column, use amount (assuming qty=1)
    if rate == 0.0 and amount > 0:
        rate = amount

    # 🔧 FIXED: Added exclusion check for one-time fees
    # B1. Exclusion Filter: Is this a one-time charge?
    is_excluded = any(k in description for k in EXCLUSION_KEYWORDS)
    if is_excluded:
        logger.debug(f"Skipping excluded item: {description}")
        return None  # Skip one-time charges

    # B2. Scope Filter: Is this a recurring fee?
    is_target = any(k in description for k in AUDIT_TARGET_KEYWORDS)
    if not is_target:
        logger.debug(f"Skipping non-recurring item: {description}")
        return None  # Skip this line

    # C. Date Gate: Is this invoice date ON or AFTER the escalation effective date?
    escalation_start = _parse_date(rules.get("effective_start_date"))
    
    if not inv_date or not escalation_start:
        return None  # Cannot audit without dates
        
    if inv_date < escalation_start:
        return None  # Invoice is too old, price should be flat. (NO LEAKAGE)

    # D. The Math Check
    base_rate = float(rules.get("base_rate", 0))
    uplift_pct = float(rules.get("escalation_rate", 0))
    
    if base_rate == 0:
        return None

    # Calculate Expected Price
    expected_rate = base_rate * (1 + uplift_pct)
    
    # Check for discrepancy (allowing $1.00 rounding tolerance)
    if rate < (expected_rate - 1.0):
        leakage = expected_rate - rate
        logger.info(f"Leakage detected: {inv_date} - Expected {expected_rate}, got {rate}, leakage {leakage}")
        return {
            "type": "invoice_line_error",
            "invoice_date": inv_date.isoformat(),
            "reference": _extract_invoice_number(row),
            "description": description,
            "found_rate": rate,
            "expected_rate": round(expected_rate, 2),
            "leakage_amount": round(leakage, 2)
        }
        
    return None


def _build_discrepancies(
    clause_distribution: Dict[str, Any],
    billing_summary: Dict[str, Any],
    rows: List[Dict[str, Any]],
    vendor_name: str,
    documents: List[Dict[str, Any]] | None,
    llm_insights: Dict[str, Any],
) -> List[Dict[str, Any]]:

    discrepancies: List[Dict[str, Any]] = []
    
    # 1. SETUP CONTRACT RULES
    # In a real production app, these keys come from the LLM JSON output.
    # For your MVP, we grab them from the 'rules' object or fallback to safe defaults.
    rules_extracted = llm_insights.get("rules", {})
    
    contract_rules = {
        "base_rate": rules_extracted.get("base_amount", 100000), # Default or extracted
        "escalation_rate": rules_extracted.get("escalation_rate", 0.05), # Default 5%
        "effective_start_date": rules_extracted.get("effective_start_date", "2025-01-01") # The Critical Date
    }
    
    # 2. EXECUTE AUDIT LOOP
    # We iterate through every billing row and check against the rules
    customer_leakage_total = 0.0
    evidence_items = []
    
    # Check if we even found a CPI clause in the contract
    cpi_hits = clause_distribution.get("cpi_uplift", 0)
    
    if cpi_hits > 0:
        logger.info(f"CPI clause found, auditing {len(rows)} billing rows")
        for row in rows:
            # Run the deterministic check
            result = _audit_line_item(row, contract_rules)
            if result:
                customer_leakage_total += result["leakage_amount"]
                evidence_items.append(result)

        # 3. BUILD REPORT
        if customer_leakage_total > 0:
            contract_evidence = _clause_references(documents, "cpi_uplift")
            
            # 🔧 FIXED: Better grammar for single/plural invoices
            invoice_text = f"{len(evidence_items)} incorrect invoice{'s' if len(evidence_items) != 1 else ''} found"
            
            discrepancies.append({
                "customer": vendor_name,
                "issue": "CPI uplift referenced in contract but invoices remained flat",
                "value": round(customer_leakage_total, 2),
                "priority": "high",
                "due": invoice_text,
                "evidence": contract_evidence + evidence_items[:5] # Attach contract clause + top 5 bad invoices
            })
            logger.info(f"Discrepancy reported: {customer_leakage_total} leakage across {len(evidence_items)} invoices")
        else:
            logger.info(f"CPI clause found but no leakage detected - all invoices correct")

    # 4. SECONDARY CHECKS (Service Credits, etc - Optional but kept for completeness)
    service_hits = clause_distribution.get("service_credits", 0)
    credits_issued = any(_extract_amount(row) < 0 for row in rows)
    if service_hits and not credits_issued and billing_summary.get("total_billed", 0) > 0:
        contract_evidence = _clause_references(documents, "service_credits")
        discrepancies.append({
            "customer": vendor_name,
            "issue": "Service credits promised but none issued in billing export",
            "value": round(billing_summary["total_billed"] * 0.01, 2), # Estimated 1% risk
            "priority": "medium",
            "due": "Review SLA clause",
            "evidence": contract_evidence
        })

    if not discrepancies and billing_summary.get("invoice_count", 0) == 0:
        discrepancies.append({
            "customer": vendor_name,
            "issue": "Billing data uploaded but no recognizable invoices were parsed",
            "value": 0,
            "priority": "low",
            "due": "Verify CSV/XLSX headers",
        })

    return discrepancies


async def run(job, llm_insights: Dict) -> Dict:
    await job_manager.simulate_latency(0.2)
    
    # 1. LOAD DATA
    billing_rows = _load_billing_rows(job)
    billing_summary = _summarize_billing(billing_rows)
    
    # 2. RUN AUDIT
    clause_distribution = llm_insights.get("clause_distribution", {})
    documents = job.metrics.get("documents") if isinstance(job.metrics.get("documents"), list) else None
    
    discrepancies = _build_discrepancies(
        clause_distribution, 
        billing_summary, 
        billing_rows, 
        job.vendor_name, 
        documents, 
        llm_insights
    )
    
    recoverable = round(sum(item.get("value", 0) for item in discrepancies), 2)

    # 3. UPDATE METRICS
    job.metrics["billing_summary"] = billing_summary
    job.metrics["recoverable_amount"] = recoverable
    job.discrepancies = discrepancies
    
    logger.info(f"Audit complete: {recoverable} recoverable across {len(discrepancies)} discrepancies")
    
    return {"discrepancies": discrepancies, "recoverable_amount": recoverable}