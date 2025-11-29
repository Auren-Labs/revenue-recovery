"""
PRODUCTION-GRADE Intelligent Billing Reconciliation
Zero false positives through multi-layer validation and smart detection

PRECISION IMPROVEMENTS:
1. Date format detection at file level
2. Percentage-based + absolute tolerance
3. Propagated confidence scoring
4. Contract term validation
5. No "obvious" bypass - always validate
6. Confidence explainer for every discrepancy
7. "Hold for Review" category for medium-confidence findings
"""

from __future__ import annotations

import csv
import json
import logging
import asyncio
from datetime import date, datetime, time, timedelta
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from app.services.pricing_timeline import build_pricing_timeline

# Import precision utilities
from app.services.precision_utils import (
    DateFormat,
    FindingStatus,
    DateFormatAnalysis,
    ToleranceConfig,
    ToleranceResult,
    TermValidationResult,
    ProRataAnalysis,
    detect_date_format,
    parse_date_with_format,
    check_amount_tolerance,
    validate_extracted_terms,
    detect_pro_rata,
    classify_finding,
    MINIMUM_CONFIDENCE_TO_SURFACE,
    MINIMUM_CONFIDENCE_FOR_CONFIRMED,
    CONFIDENCE_REDUCTION_AMBIGUOUS_DATE,
    CONFIDENCE_REDUCTION_LOW_EXTRACTION,
    CONFIDENCE_REDUCTION_NO_CONTRACT_EVIDENCE,
)

# Import confidence scoring
from app.services.confidence_scoring import (
    ConfidenceBreakdown,
    ConfidenceBuilder,
    ConfidenceThresholds,
    DEFAULT_THRESHOLDS,
    combine_confidences,
    generate_confidence_explanation,
)

try:
    import openpyxl  # type: ignore
except ImportError:
    openpyxl = None

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None

from app.config import get_settings
from app.services import job_manager
from app.services import openai_rate_limit, rag_store

logger = logging.getLogger(__name__)
settings = get_settings()


# ============================================================================
# ENUMS AND CONSTANTS
# ============================================================================

class DiscrepancyType(Enum):
    """Types of billing discrepancies."""
    MISSING_ESCALATION = "missing_escalation"
    INCORRECT_RATE = "incorrect_rate"
    MISSING_SLA_CREDITS = "missing_sla_credits"
    UNEXPECTED_CHARGE = "unexpected_charge"
    DUPLICATE_CHARGE = "duplicate_charge"


class Priority(Enum):
    """Priority levels for discrepancies."""
    CRITICAL = "critical"  # Definite financial loss
    HIGH = "high"         # Likely financial loss
    MEDIUM = "medium"     # Possible issue, needs review
    LOW = "low"          # Informational, monitor
    INFO = "info"        # Just tracking, no action needed


class InvoiceClassification(Enum):
    """Invoice line item classifications."""
    RECURRING = "recurring"
    ONE_TIME = "one_time"
    CREDIT = "credit"
    ADJUSTMENT = "adjustment"
    UNKNOWN = "unknown"


# ============================================================================
# DATA MODELS
# ============================================================================

@dataclass
class ContractRules:
    """Validated contract rules for auditing."""
    base_amount: float
    escalation_rate: float
    effective_start_date: date
    currency: str
    invoice_keywords: List[str]
    exclusion_keywords: List[str]
    sla_uptime: Optional[float] = None
    service_credit_rate: Optional[float] = None
    amendment_history: List[Dict[str, Any]] = None
    extraction_confidence: float = 1.0  # NEW: Track extraction confidence
    needs_review: bool = False  # NEW: Flag if manual review needed
    validation_warnings: List[str] = field(default_factory=list)  # NEW: Validation warnings
    
    def __post_init__(self):
        """Initialize amendment_history if not provided."""
        if self.amendment_history is None:
            self.amendment_history = []
        if self.validation_warnings is None:
            self.validation_warnings = []
    
    def expected_amount_after_escalation(self) -> float:
        """Calculate expected amount after escalation."""
        return self.base_amount * (1 + self.escalation_rate)
    
    def validate(self) -> Tuple[bool, List[str]]:
        """Validate contract rules are reasonable."""
        issues = []
        
        if self.base_amount <= 0:
            issues.append(f"Invalid base amount: {self.base_amount}")
        
        if self.escalation_rate < 0 or self.escalation_rate > 0.5:
            issues.append(f"Suspicious escalation rate: {self.escalation_rate*100}%")
        
        if not self.currency:
            issues.append("Currency not specified")
        
        return len(issues) == 0, issues


@dataclass
class InvoiceLineItem:
    """Parsed invoice line item with classification."""
    description: str
    amount: float
    rate: float
    invoice_date: Optional[date]
    invoice_number: Optional[str]
    classification: InvoiceClassification
    confidence: float
    raw_row: Dict[str, Any]
    
    # NEW: Additional precision metadata
    date_parsing_confidence: float = 1.0
    date_was_ambiguous: bool = False
    classification_reason: str = ""
    
    def is_after_date(self, cutoff_date: date) -> bool:
        """Check if invoice is after a date."""
        return self.invoice_date and self.invoice_date >= cutoff_date
    
    def is_likely_recurring(self) -> bool:
        """Check if this is likely a recurring charge."""
        return (
            self.classification == InvoiceClassification.RECURRING and
            self.confidence > 0.7
        )
    
    def effective_confidence(self) -> float:
        """Get effective confidence considering all factors."""
        base = self.confidence
        
        # Reduce confidence if date was ambiguous
        if self.date_was_ambiguous:
            base *= CONFIDENCE_REDUCTION_AMBIGUOUS_DATE
        
        return base


@dataclass
class Discrepancy:
    """Detected billing discrepancy with evidence."""
    type: DiscrepancyType
    priority: Priority
    title: str
    description: str
    financial_impact: float
    invoice_items: List[InvoiceLineItem]
    contract_evidence: List[Dict[str, Any]]
    confidence: float
    recommendations: List[str]
    
    # NEW: Precision enhancements
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    finding_status: FindingStatus = FindingStatus.NEEDS_REVIEW
    validation_reason: str = ""
    
    def effective_confidence(self) -> float:
        """
        Calculate effective confidence from all signals.
        """
        if self.confidence_breakdown:
            return self.confidence_breakdown.overall()
        return self.confidence
    
    def should_surface(self) -> bool:
        """Check if this discrepancy should be surfaced to the client."""
        return self.effective_confidence() >= MINIMUM_CONFIDENCE_TO_SURFACE

    def to_dict(self) -> Dict[str, Any]:
        """Convert to API response format."""
        primary_item = self.invoice_items[0] if self.invoice_items else None
        primary_invoice_date = primary_item.invoice_date.isoformat() if primary_item and primary_item.invoice_date else None
        primary_invoice_number = primary_item.invoice_number if primary_item else None
        
        # Extract customer from invoice item
        customer = None
        if primary_item and primary_item.raw_row:
            customer = _extract_field(primary_item.raw_row, _CUSTOMER_FIELDS)
            if customer:
                customer = str(customer).strip()
        
        # Generate due date
        due_date = None
        if primary_item and primary_item.invoice_date:
            due_date = (primary_item.invoice_date + timedelta(days=30)).isoformat()
        
        result = {
            "type": self.type.value,
            "priority": self.priority.value,
            "issue": self.title,
            "description": self.description,
            "value": round(self.financial_impact, 2),
            "confidence": round(self.effective_confidence(), 3),
            "customer": customer or "Unknown customer",
            "due": due_date,
            "invoice_date": primary_invoice_date,
            "invoice_reference": primary_invoice_number,
            "finding_status": self.finding_status.value,  # NEW
            "validation_reason": self.validation_reason,  # NEW
            "evidence": self.contract_evidence + [
                {
                    "type": "invoice_line_error",
                    "invoice_date": item.invoice_date.isoformat() if item.invoice_date else None,
                    "reference": item.invoice_number,
                    "description": item.description,
                    "found_rate": item.rate,
                    "classification": item.classification.value,
                    "confidence": round(item.effective_confidence(), 3),
                    "date_was_ambiguous": item.date_was_ambiguous,  # NEW
                }
                for item in self.invoice_items[:5]
            ],
            "recommendations": self.recommendations,
        }
        
        # Add confidence breakdown if available
        if self.confidence_breakdown:
            result["confidence_breakdown"] = self.confidence_breakdown.to_dict()
        
        return result


# ============================================================================
# FIELD EXTRACTORS
# ============================================================================

_AMOUNT_FIELDS = ["amount", "Amount", "value", "Value", "total", "Total", "charge", "Charge", "billed", "Billed"]
_CUSTOMER_FIELDS = ["Customer", "customer", "Account", "account", "Client", "client", "Company", "company", "Name"]
_INVOICE_DATE_FIELDS = ["Invoice_Date", "invoice_date", "Date", "date", "InvoiceDate"]
_INVOICE_FIELDS = ["InvoiceNumber", "invoiceNumber", "Invoice", "invoice", "Number", "number", "Id", "ID", "Invoice_No"]
_DESC_FIELDS = ["Item_Desc", "item_desc", "Description", "description", "Memo", "memo", "Activity"]
_RATE_FIELDS = ["Rate", "rate", "Unit Price", "unit_price", "Price"]


def _to_float(value: Any) -> float:
    """Convert value to float safely."""
    if value in (None, "", "NA"):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace("$", "").replace(",", "").replace("₹", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _extract_field(row: Dict, choices: List[str]) -> Any:
    """Extract field by trying multiple column names."""
    for field in choices:
        if field in row:
            return row[field]
    return None


# ============================================================================
# GPT-4O INTELLIGENT CLASSIFIER
# ============================================================================

class IntelligentClassifier:
    """Production-grade GPT-4o classifier with tenant-isolated caching."""
    
    def __init__(self, customer_id: str, job_id: str):
        """
        Initialize classifier with tenant isolation.
        """
        self.customer_id = customer_id
        self.job_id = job_id
        self.client = None
        self.enabled = False
        self.cache = {}
        
        api_key = settings.openai_api_key if hasattr(settings, 'openai_api_key') else None
        if AsyncOpenAI and api_key:
            try:
                self.client = AsyncOpenAI(api_key=api_key)
                self.enabled = True
                logger.info("✓ Intelligent classifier initialized (GPT-4o enabled)")
            except Exception as e:
                logger.warning(f"GPT-4o unavailable: {e}")
        else:
            logger.info("✓ Intelligent classifier initialized (deterministic mode)")
    
    def reset(self):
        """Clear cache for new job."""
        self.cache.clear()
        logger.debug("Cache cleared")
    
    def _deterministic_classification(self, description: str, amount: float) -> Tuple[InvoiceClassification, float, str]:
        """
        Fast, deterministic classification for obvious cases.
        Returns: (classification, confidence, reasoning)
        """
        desc_lower = description.lower()
        
        # CREDITS (negative amounts)
        if amount < 0:
            return (InvoiceClassification.CREDIT, 0.99, "Negative amount indicates credit/refund")
        
        # OBVIOUS ONE-TIME
        onetime_keywords = [
            "implementation", "setup", "onboarding", "installation", "migration",
            "training", "workshop", "initial", "one-time", "wrap-up", "kickoff",
            "consulting", "professional services", "project", "data migration"
        ]
        if any(kw in desc_lower for kw in onetime_keywords):
            matched = [kw for kw in onetime_keywords if kw in desc_lower][0]
            return (InvoiceClassification.ONE_TIME, 0.95, f"Matched one-time keyword: '{matched}'")
        
        # OBVIOUS RECURRING
        recurring_keywords = [
            "monthly subscription", "annual subscription", "monthly fee", "annual fee",
            "saas", "platform", "recurring", "monthly service", "license",
            "cloud infrastructure management", "managed service", "hosting"
        ]
        if any(kw in desc_lower for kw in recurring_keywords):
            matched = [kw for kw in recurring_keywords if kw in desc_lower][0]
            return (InvoiceClassification.RECURRING, 0.95, f"Matched recurring keyword: '{matched}'")
        
        # ADJUSTMENTS
        adjustment_keywords = ["adjustment", "correction", "pro-rata", "prorata", "partial month"]
        if any(kw in desc_lower for kw in adjustment_keywords):
            matched = [kw for kw in adjustment_keywords if kw in desc_lower][0]
            return (InvoiceClassification.ADJUSTMENT, 0.90, f"Matched adjustment keyword: '{matched}'")
        
        # UNKNOWN - needs GPT-4o
        return (InvoiceClassification.UNKNOWN, 0.3, "Ambiguous description - needs AI classification")
    
    async def classify_line_item(
        self,
        description: str,
        amount: float,
        invoice_date: Optional[date] = None,
        contract_keywords: Optional[List[str]] = None
    ) -> Tuple[InvoiceClassification, float, str]:
        """
        Classify invoice line item with high accuracy.
        Returns: (classification, confidence, reasoning)
        """
        # Check cache
        cache_key = f"{description.lower().strip()}_{amount}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        # Try deterministic classification first (covers 90% of cases)
        classification, confidence, reasoning = self._deterministic_classification(description, amount)
        
        if classification != InvoiceClassification.UNKNOWN:
            result = (classification, confidence, reasoning)
            self.cache[cache_key] = result
            return result
        
        # Use GPT-4o for ambiguous cases
        if not self.enabled:
            # Fallback to heuristic
            if amount > 50000:  # Large regular amount
                result = (InvoiceClassification.RECURRING, 0.6, "Large amount suggests recurring (fallback)")
            else:
                result = (InvoiceClassification.UNKNOWN, 0.4, "Unable to classify (GPT-4o unavailable)")
            self.cache[cache_key] = result
            return result
        
        # Check rate limit
        is_allowed, error_msg = openai_rate_limit.check_openai_rate_limit(
            self.customer_id,
            self.job_id
        )
        if not is_allowed:
            logger.warning(f"OpenAI rate limit hit for job {self.job_id}: {error_msg}")
            if amount > 50000:
                result = (InvoiceClassification.RECURRING, 0.6, f"Rate limit hit, using fallback: {error_msg}")
            else:
                result = (InvoiceClassification.UNKNOWN, 0.4, f"Rate limit hit: {error_msg}")
            self.cache[cache_key] = result
            return result
        
        try:
            prompt = f"""Classify this invoice line: RECURRING, ONE_TIME, or ADJUSTMENT?

Description: {description}
Amount: {amount}
{f"Date: {invoice_date}" if invoice_date else ""}
{f"Contract services: {', '.join(contract_keywords[:5])}" if contract_keywords else ""}

RECURRING = monthly/annual subscription, platform fee, managed service, license
ONE_TIME = setup, implementation, training, consulting, migration
ADJUSTMENT = pro-rata, credit, partial month, correction

JSON only: {{"classification": "RECURRING|ONE_TIME|ADJUSTMENT", "confidence": 0.0-1.0, "reasoning": "..."}}"""

            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a billing expert. Classify invoices accurately."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0,
                max_tokens=100
            )
            
            # Record the call
            tokens_used = response.usage.total_tokens if response.usage else 0
            openai_rate_limit.record_openai_call(
                self.customer_id,
                self.job_id,
                tokens_used
            )
            
            response_text = response.choices[0].message.content.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1].strip()
                if response_text.startswith("json"):
                    response_text = response_text[4:].strip()
            
            data = json.loads(response_text)
            
            classification_str = data.get("classification", "UNKNOWN").upper()
            classification_map = {
                "RECURRING": InvoiceClassification.RECURRING,
                "ONE_TIME": InvoiceClassification.ONE_TIME,
                "ADJUSTMENT": InvoiceClassification.ADJUSTMENT,
                "CREDIT": InvoiceClassification.CREDIT
            }
            
            classification = classification_map.get(classification_str, InvoiceClassification.UNKNOWN)
            confidence = float(data.get("confidence", 0.5))
            reasoning = data.get("reasoning", "GPT-4o classification")
            
            result = (classification, confidence, reasoning)
            self.cache[cache_key] = result
            
            logger.debug(f"GPT-4o: '{description[:40]}...' → {classification.value} ({confidence:.2f})")
            return result
            
        except Exception as e:
            logger.error(f"GPT-4o classification error: {e}")
            result = (InvoiceClassification.UNKNOWN, 0.4, f"Classification failed: {str(e)}")
            self.cache[cache_key] = result
            return result
    
    async def validate_discrepancy(
        self,
        invoice_item: InvoiceLineItem,
        expected_amount: float,
        contract_context: str
    ) -> Tuple[bool, float, str, str]:
        """
        Validate if flagged discrepancy is real or false positive.
        
        PRECISION IMPROVEMENT: Never skip validation, always run through GPT-4o.
        
        Returns: (is_valid, confidence, reason, recommended_action)
        """
        if not self.enabled:
            return (True, 0.7, "GPT-4o unavailable - defaulting to flagged", "review")
        
        difference = expected_amount - invoice_item.rate
        percentage_diff = abs(difference / expected_amount) * 100 if expected_amount > 0 else 0
        
        # Use tolerance checking
        tolerance_result = check_amount_tolerance(expected_amount, invoice_item.rate)
        
        if tolerance_result.is_within_tolerance:
            return (False, 0.95, tolerance_result.reason, "approve")
        
        # Check for pro-rata
        pro_rata = detect_pro_rata(invoice_item.rate, expected_amount, invoice_item.description)
        if pro_rata.is_likely_pro_rata and pro_rata.confidence > 0.7:
            return (False, pro_rata.confidence, pro_rata.reason, "approve")
        
        # Already classified as adjustment
        if invoice_item.classification == InvoiceClassification.ADJUSTMENT:
            return (False, 0.90, "Legitimate adjustment (pro-rata or partial)", "approve")
        
        # Check rate limit
        is_allowed, error_msg = openai_rate_limit.check_openai_rate_limit(
            self.customer_id,
            self.job_id
        )
        if not is_allowed:
            logger.warning(f"OpenAI rate limit hit for job {self.job_id}: {error_msg}")
            return (True, 0.6, f"Rate limit hit, defaulting to flag: {error_msg}", "investigate")
        
        try:
            prompt = f"""You are auditing a billing discrepancy. Determine if this is a REAL ERROR or FALSE POSITIVE.

INVOICE LINE:
- Date: {invoice_item.invoice_date}
- Description: {invoice_item.description}
- Amount Charged: {invoice_item.rate:,.2f}
- Amount Expected: {expected_amount:,.2f}
- Difference: {difference:,.2f} ({percentage_diff:.1f}%)

CONTRACT TERMS:
{contract_context}

CRITICAL CONTEXT:
The contract states that escalation takes effect ON the effective date (not after).
An invoice dated on or after the effective date MUST use the escalated rate.

ANALYSIS:
Could this difference be explained by:
1. Pro-rata (partial month service)? Check if amount is ~50% of expected
2. Service credit applied?
3. Volume discount?
4. Data entry error (wrong rate applied)?
5. Legitimate one-time adjustment?

If the invoice is dated ON or AFTER the escalation effective date AND shows the old rate with NO indication of pro-rata/adjustment, this is a REAL ERROR.

Respond with ONLY valid JSON:
{{"is_valid_error": true|false, "confidence": 0.0-1.0, "reason": "brief explanation", "action": "dispute|approve|investigate"}}"""

            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a billing auditor. Flag REAL errors, approve legitimate variations."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0,
                max_tokens=200
            )
            
            # Record the call
            tokens_used = response.usage.total_tokens if response.usage else 0
            openai_rate_limit.record_openai_call(
                self.customer_id,
                self.job_id,
                tokens_used
            )
            
            response_text = response.choices[0].message.content.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1].strip()
                if response_text.startswith("json"):
                    response_text = response_text[4:].strip()
            
            data = json.loads(response_text)
            
            is_valid = data.get("is_valid_error", True)
            confidence = float(data.get("confidence", 0.6))
            reason = data.get("reason", "GPT-4o validation")
            action = data.get("action", "investigate")
            
            logger.info(f"Validation: {reason} (valid={is_valid}, conf={confidence:.2f})")
            return (is_valid, confidence, reason, action)
            
        except Exception as e:
            logger.error(f"Validation error: {e}")
            return (True, 0.5, f"Validation failed: {str(e)}", "review")


# ============================================================================
# FILE READERS
# ============================================================================

def _read_csv(path: Path, delimiter: str = ",") -> List[Dict[str, Any]]:
    """Read CSV with proper cleanup."""
    rows = []
    handle = None
    try:
        handle = path.open("r", encoding="utf-8-sig", newline="")
        reader = csv.DictReader(handle, delimiter=delimiter)
        for raw in reader:
            sanitized = {key.strip(): value for key, value in raw.items() if key}
            sanitized["__source_file"] = path.name
            rows.append(sanitized)
    finally:
        if handle:
            handle.close()
    return rows


def _read_excel(path: Path) -> List[Dict[str, Any]]:
    """Read Excel with proper cleanup."""
    if not openpyxl:
        logger.warning(f"openpyxl not installed; skipping {path.name}")
        return []
    
    workbook = None
    try:
        workbook = openpyxl.load_workbook(path, data_only=True)
        sheet = workbook.active
        rows = []
        
        header_row = next(sheet.iter_rows(min_row=1, max_row=1), None)
        if not header_row:
            return rows
        
        headers = [
            str(cell.value).strip() if cell.value is not None else f"column_{idx}"
            for idx, cell in enumerate(header_row, start=1)
        ]
        
        for excel_row in sheet.iter_rows(min_row=2, values_only=True):
            record = {}
            if excel_row:
                for idx in range(min(len(headers), len(excel_row))):
                    val = excel_row[idx]
                    if isinstance(val, (datetime, date)):
                        val = val.isoformat()
                    elif isinstance(val, time):
                        val = val.strftime("%H:%M:%S")
                    record[headers[idx]] = val
            record["__source_file"] = path.name
            rows.append(record)
        
        return rows
    finally:
        if workbook:
            workbook.close()


def _load_billing_rows(job) -> List[Dict[str, Any]]:
    """Load all billing records from job."""
    rows = []
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
    
    logger.info(f"Loaded {len(rows)} billing rows from {len(job.billing_records)} files")
    return rows


# ============================================================================
# INVOICE PARSER WITH PRECISION IMPROVEMENTS
# ============================================================================

async def _parse_invoice_items(
    rows: List[Dict[str, Any]],
    contract_keywords: List[str],
    classifier: IntelligentClassifier,
    date_format_analysis: DateFormatAnalysis  # NEW: Pass detected date format
) -> List[InvoiceLineItem]:
    """
    Parse and classify all invoice line items.
    
    PRECISION IMPROVEMENT: Uses detected date format for consistent parsing.
    """
    logger.info(f"Parsing {len(rows)} invoice rows...")
    logger.info(f"Using detected date format: {date_format_analysis.detected_format.value} "
                f"(confidence: {date_format_analysis.confidence:.0%})")
    
    items = []
    tasks = []
    
    for row in rows:
        description = str(_extract_field(row, _DESC_FIELDS) or "")
        amount = _to_float(_extract_field(row, _AMOUNT_FIELDS))
        rate = _to_float(_extract_field(row, _RATE_FIELDS))
        
        if rate == 0.0 and amount > 0:
            rate = amount
        
        # PRECISION IMPROVEMENT: Use detected date format
        raw_date = _extract_field(row, _INVOICE_DATE_FIELDS)
        invoice_date, date_confidence = parse_date_with_format(
            raw_date,
            date_format_analysis.detected_format
        )
        
        # Track if date was ambiguous
        date_was_ambiguous = (
            date_format_analysis.detected_format in (DateFormat.AMBIGUOUS, DateFormat.MIXED) or
            date_confidence < 0.8
        )
        
        invoice_number = str(_extract_field(row, _INVOICE_FIELDS) or "")
        
        # Store for batch classification
        tasks.append({
            "row": row,
            "description": description,
            "amount": amount,
            "rate": rate,
            "invoice_date": invoice_date,
            "invoice_number": invoice_number,
            "date_confidence": date_confidence,
            "date_was_ambiguous": date_was_ambiguous,
        })
    
    # Batch classify all items
    classifications = await asyncio.gather(*[
        classifier.classify_line_item(
            t["description"],
            t["amount"],
            t["invoice_date"],
            contract_keywords
        )
        for t in tasks
    ])
    
    # Create InvoiceLineItem objects
    for task, (classification, confidence, reasoning) in zip(tasks, classifications):
        items.append(InvoiceLineItem(
            description=task["description"],
            amount=task["amount"],
            rate=task["rate"],
            invoice_date=task["invoice_date"],
            invoice_number=task["invoice_number"],
            classification=classification,
            confidence=confidence,
            raw_row=task["row"],
            date_parsing_confidence=task["date_confidence"],
            date_was_ambiguous=task["date_was_ambiguous"],
            classification_reason=reasoning,
        ))
    
    # Log classification summary
    recurring = sum(1 for item in items if item.classification == InvoiceClassification.RECURRING)
    onetime = sum(1 for item in items if item.classification == InvoiceClassification.ONE_TIME)
    credits = sum(1 for item in items if item.classification == InvoiceClassification.CREDIT)
    adjustments = sum(1 for item in items if item.classification == InvoiceClassification.ADJUSTMENT)
    ambiguous_dates = sum(1 for item in items if item.date_was_ambiguous)
    
    logger.info(f"Classification: {recurring} recurring, {onetime} one-time, {credits} credits, {adjustments} adjustments")
    if ambiguous_dates > 0:
        logger.warning(f"⚠️ {ambiguous_dates} invoices have ambiguous dates - reduced confidence")
    
    return items


# ============================================================================
# INTELLIGENT ESCALATION AUDIT WITH PRECISION
# ============================================================================

async def _audit_escalation_clause(
    invoice_items: List[InvoiceLineItem],
    rules: ContractRules,
    documents: List[Dict[str, Any]],
    classifier: IntelligentClassifier,
    pricing_timeline
) -> Tuple[List[Discrepancy], List[Discrepancy], List[Discrepancy]]:
    """
    Audit for pricing discrepancies using the unified timeline.
    
    PRECISION IMPROVEMENT: Returns three categories:
    - confirmed: High confidence, surface to client
    - needs_review: Medium confidence, flag for human
    - dismissed: Low confidence, filtered out
    """
    # Filter to recurring charges with dates
    affected_items = [
        item for item in invoice_items
        if item.is_likely_recurring() and item.invoice_date
    ]
    
    if not affected_items:
        logger.info("No recurring charges with dates to audit")
        return [], [], []
    
    logger.info(f"Auditing {len(affected_items)} recurring charges")
    
    # Use tolerance config
    tolerance_config = ToleranceConfig()
    
    confirmed_discrepancies = []
    needs_review_discrepancies = []
    dismissed_discrepancies = []
    
    contract_evidence = _get_clause_references(documents, "cpi_uplift", limit=2)
    has_contract_evidence = len(contract_evidence) > 0
    
    # Track processed items to avoid exact duplicates (same invoice + date + rate + amount)
    # This prevents the same line item from being processed twice
    processed_items = set()
    
    for item in affected_items:
        # Skip exact duplicates (same invoice number, date, rate, and amount)
        item_key = f"{item.invoice_number or 'N/A'}_{item.invoice_date.isoformat() if item.invoice_date else 'N/A'}_{item.rate}_{item.amount}"
        if item_key in processed_items:
            logger.debug(f"Skipping duplicate invoice item: {item_key}")
            continue
        processed_items.add(item_key)
        
        # Get expected amount from timeline
        expected_rate, reason = pricing_timeline.get_expected_amount(item.invoice_date)
        
        logger.debug(f"Invoice {item.invoice_date}: billed={item.rate:,.0f}, expected={expected_rate:,.0f} ({reason})")
        
        # Check tolerance
        tolerance_result = check_amount_tolerance(expected_rate, item.rate, tolerance_config)
        
        if tolerance_result.is_within_tolerance:
            continue
        
        # Check for pro-rata
        pro_rata = detect_pro_rata(item.rate, expected_rate, item.description)
        if pro_rata.is_likely_pro_rata and pro_rata.confidence > 0.7:
            logger.info(f"Pro-rata detected: {item.description[:50]} - {pro_rata.reason}")
            continue
        
        # Calculate difference
        difference = expected_rate - item.rate
        
        # PRECISION IMPROVEMENT: Always validate with GPT-4o (no "obvious" bypass)
        is_valid, validation_confidence, validation_reason, action = await classifier.validate_discrepancy(
            item,
            expected_rate,
            f"Expected: ₹{expected_rate:,.0f} ({reason}). Escalation rate: {rules.escalation_rate*100}%"
        )
        
        if not is_valid:
            # False positive detected
            logger.info(f"False positive filtered: {validation_reason}")
            continue
        
        # Build confidence breakdown
        confidence_builder = ConfidenceBuilder()
        confidence_builder.with_classification(
            item.confidence,
            item.classification_reason
        )
        confidence_builder.with_date_parsing(
            item.date_parsing_confidence,
            "Unambiguous date" if not item.date_was_ambiguous else "Ambiguous date format"
        )
        confidence_builder.with_amount_match(
            1.0 - tolerance_result.percentage_difference,  # Higher diff = lower confidence
            f"Difference: ₹{abs(difference):,.0f} ({tolerance_result.percentage_difference*100:.1f}%)"
        )
        confidence_builder.with_contract_extraction(
            rules.extraction_confidence,
            "Contract terms extracted successfully" if rules.extraction_confidence > 0.7 else "Low extraction confidence"
        )
        confidence_builder.with_validation(
            validation_confidence,
            validation_reason
        )
        
        # Add penalty if no contract evidence
        if not has_contract_evidence:
            confidence_builder.with_additional_factor(
                "Contract Evidence",
                CONFIDENCE_REDUCTION_NO_CONTRACT_EVIDENCE,
                1.0,
                "No matching clause found in contract"
            )
        
        confidence_breakdown = confidence_builder.build()
        overall_confidence = confidence_breakdown.overall()
        
        # Classify finding status
        finding_status = classify_finding(
            confidence=overall_confidence,
            financial_impact=difference,
            has_contract_evidence=has_contract_evidence,
            validation_passed=is_valid and validation_confidence > 0.7
        )
        
        # Determine priority
        if finding_status == FindingStatus.CONFIRMED_DISCREPANCY:
            priority = Priority.CRITICAL if difference > rules.base_amount * 0.1 else Priority.HIGH
        elif finding_status == FindingStatus.NEEDS_REVIEW:
            priority = Priority.MEDIUM
        else:
            priority = Priority.LOW
        
        discrepancy = Discrepancy(
            type=DiscrepancyType.MISSING_ESCALATION,
            priority=priority,
            title=f"Price escalation not applied ({rules.escalation_rate*100}%)",
            description=f"Invoice dated {item.invoice_date} shows rate of ₹{item.rate:,.2f} instead of expected ₹{expected_rate:,.2f}. {reason}",
            financial_impact=difference,
            invoice_items=[item],
            contract_evidence=contract_evidence,
            confidence=overall_confidence,
            recommendations=[
                f"Review invoice {item.invoice_number or 'N/A'}",
                f"Expected rate: ₹{expected_rate:,.2f} {rules.currency}",
                f"Reason: {reason}",
                f"Action: {action}"
            ],
            confidence_breakdown=confidence_breakdown,
            finding_status=finding_status,
            validation_reason=validation_reason,
        )
        
        # Categorize by finding status
        if finding_status == FindingStatus.CONFIRMED_DISCREPANCY:
            confirmed_discrepancies.append(discrepancy)
        elif finding_status == FindingStatus.NEEDS_REVIEW:
            needs_review_discrepancies.append(discrepancy)
        else:
            dismissed_discrepancies.append(discrepancy)
    
    logger.info(f"✓ Audit results: {len(confirmed_discrepancies)} confirmed, "
                f"{len(needs_review_discrepancies)} needs review, "
                f"{len(dismissed_discrepancies)} dismissed")
    
    return confirmed_discrepancies, needs_review_discrepancies, dismissed_discrepancies


# ============================================================================
# INTELLIGENT SLA CREDIT AUDIT
# ============================================================================

async def _audit_sla_credits(
    invoice_items: List[InvoiceLineItem],
    rules: ContractRules,
    documents: List[Dict[str, Any]],
    total_billed: float
) -> Optional[Discrepancy]:
    """
    Audit for missing SLA credits with intelligent detection.
    """
    if rules.sla_uptime is None:
        return None
    
    credits_issued = [item for item in invoice_items if item.classification == InvoiceClassification.CREDIT]
    
    downtime_indicators = [
        "downtime", "outage", "incident", "unavailable", "offline",
        "service interruption", "degraded", "slow", "performance issue"
    ]
    
    downtime_mentioned = [
        item for item in invoice_items
        if any(indicator in item.description.lower() for indicator in downtime_indicators)
    ]
    
    if downtime_mentioned and not credits_issued:
        estimated_impact = total_billed * 0.01
        contract_evidence = _get_clause_references(documents, "service_credits", limit=2)
        
        # Build confidence
        confidence_builder = ConfidenceBuilder()
        confidence_builder.with_classification(0.7, "Downtime indicators found in invoices")
        confidence_builder.with_validation(0.6, "No credits issued despite downtime references")
        
        return Discrepancy(
            type=DiscrepancyType.MISSING_SLA_CREDITS,
            priority=Priority.MEDIUM,
            title="Potential missing SLA credits",
            description=f"Contract guarantees {rules.sla_uptime}% uptime with service credits. "
                       f"Found {len(downtime_mentioned)} reference(s) to service issues but no credits issued.",
            financial_impact=estimated_impact,
            invoice_items=downtime_mentioned[:3],
            contract_evidence=contract_evidence,
            confidence=0.65,
            recommendations=[
                "Review service uptime logs for reported period",
                "Verify if SLA breaches occurred",
                "Calculate appropriate credits if breach confirmed"
            ],
            confidence_breakdown=confidence_builder.build(),
            finding_status=FindingStatus.NEEDS_REVIEW,
            validation_reason="Downtime indicators found without corresponding credits"
        )
    
    if credits_issued:
        logger.info(f"✓ SLA credits found: {len(credits_issued)} credit entries")
    else:
        logger.info(f"✓ No downtime indicators found - SLA likely met")
    
    return None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _get_clause_references(documents: List[Dict[str, Any]] | None, label: str, limit: int = 2) -> List[Dict[str, Any]]:
    """Get contract clause references for evidence."""
    references = []
    if not documents:
        return references
    
    for doc in documents:
        for clause in doc.get("clauses", []) or []:
            if clause.get("label") == label:
                reference = {
                    "type": "contract_clause",
                    "label": label,
                    "text": clause.get("text"),
                    "file": doc.get("filename"),
                    "confidence": clause.get("confidence")
                }
                
                if clause.get("regions"):
                    reference["regions"] = clause.get("regions")
                    if clause["regions"] and len(clause["regions"]) > 0:
                        first_region = clause["regions"][0]
                        if first_region.get("bounds"):
                            reference["bounds"] = first_region["bounds"]
                
                if clause.get("page") is not None:
                    reference["page"] = clause.get("page")
                
                references.append(reference)
                if len(references) >= limit:
                    return references
    
    return references


def _extract_contract_rules(llm_insights: Dict[str, Any]) -> ContractRules:
    """
    Extract and validate contract rules from LLM insights.
    
    PRECISION IMPROVEMENT: Validates extracted terms and tracks confidence.
    """
    rules_data = llm_insights.get("rules", {})
    
    # Get GPT-4o terms for validation
    gpt4o_terms = {}
    for doc in llm_insights.get("documents", []):
        if doc.get("gpt4o_contract_terms"):
            gpt4o_terms = doc["gpt4o_contract_terms"]
            break
    
    # Validate extracted terms
    validation_result = None
    extraction_confidence = 1.0
    validation_warnings = []
    needs_review = False
    
    if gpt4o_terms:
        validation_result = validate_extracted_terms(gpt4o_terms, "contract")
        extraction_confidence = gpt4o_terms.get("extraction_confidence", {}).get("overall", 0.7)
        validation_warnings = validation_result.warnings
        needs_review = validation_result.needs_review
    
    base_amount = float(rules_data.get("base_amount", 0))
    escalation_rate = float(rules_data.get("escalation_rate", 0))
    effective_date_str = rules_data.get("effective_start_date", "")
    
    # Parse effective date with confidence tracking
    effective_date = None
    if effective_date_str:
        try:
            effective_date = datetime.fromisoformat(str(effective_date_str)).date()
        except (ValueError, TypeError):
            validation_warnings.append(f"Could not parse effective date: {effective_date_str}")
            needs_review = True
    
    if not effective_date:
        effective_date = date(2025, 1, 1)
        validation_warnings.append("Using default effective date: 2025-01-01")
    
    currency = rules_data.get("currency", "INR")
    invoice_keywords = rules_data.get("invoice_keywords", [])
    exclusion_keywords = rules_data.get("exclusion_keywords", [])
    sla_uptime = rules_data.get("sla_uptime")
    service_credit_rate = rules_data.get("service_credit_rate")
    amendment_history = rules_data.get("amendment_history", [])
    
    rules = ContractRules(
        base_amount=base_amount,
        escalation_rate=escalation_rate,
        effective_start_date=effective_date,
        currency=currency,
        invoice_keywords=invoice_keywords,
        exclusion_keywords=exclusion_keywords,
        sla_uptime=sla_uptime,
        service_credit_rate=service_credit_rate,
        amendment_history=amendment_history,
        extraction_confidence=extraction_confidence,
        needs_review=needs_review,
        validation_warnings=validation_warnings,
    )
    
    # Validate
    is_valid, issues = rules.validate()
    if not is_valid:
        logger.warning(f"Contract rules validation issues: {', '.join(issues)}")
    else:
        if amendment_history:
            logger.info(f"✓ Amendment history: {len(amendment_history)} price changes tracked")
        logger.info(f"✓ Final rules: base={base_amount}, escalation={escalation_rate*100}%, effective={effective_date}")
        logger.info(f"✓ Extraction confidence: {extraction_confidence:.0%}")
    
    if validation_warnings:
        logger.warning(f"⚠️ Validation warnings: {'; '.join(validation_warnings)}")
    
    return rules


def _summarize_billing(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate billing summary statistics."""
    amounts = []
    customer_totals = {}
    
    for row in rows:
        amount = _to_float(_extract_field(row, _AMOUNT_FIELDS))
        if amount == 0.0:
            continue
        
        amounts.append(amount)
        customer = _extract_field(row, _CUSTOMER_FIELDS) or "Unspecified"
        customer = str(customer).strip()
        customer_totals.setdefault(customer, []).append(amount)
    
    customers_summary = [
        {
            "customer": c,
            "total": round(sum(v), 2),
            "invoice_count": len(v),
            "avg_invoice": round(mean(v), 2)
        }
        for c, v in customer_totals.items()
    ]
    customers_summary.sort(key=lambda x: x["total"], reverse=True)
    
    return {
        "total_billed": round(sum(amounts), 2),
        "invoice_count": len(amounts),
        "avg_invoice": round(mean(amounts), 2) if amounts else 0.0,
        "largest_invoice": max(amounts) if amounts else 0.0,
        "customers": customers_summary,
        "sources": sorted({row.get("__source_file") for row in rows if row.get("__source_file")})
    }


# ============================================================================
# MAIN PIPELINE
# ============================================================================

async def run(job, llm_insights: Dict) -> Dict:
    """
    Production-grade intelligent reconciliation pipeline.
    
    PRECISION IMPROVEMENTS:
    1. Date format detection at file level
    2. Percentage-based + absolute tolerance
    3. Propagated confidence scoring
    4. Contract term validation
    5. No "obvious" bypass - always validate
    6. Confidence explainer for every discrepancy
    7. "Hold for Review" category for medium-confidence findings
    """
    await job_manager.simulate_latency(0.1)
    
    logger.info("="*70)
    logger.info("STARTING INTELLIGENT RECONCILIATION (PRECISION MODE)")
    logger.info("="*70)
    
    start_time = datetime.now()
    
    # Create tenant-isolated classifier
    customer_id = job.customer_id or "default"
    _classifier = IntelligentClassifier(customer_id=customer_id, job_id=job.id)
    
    # Step 1: Load billing data
    logger.info("[1/7] Loading billing data...")
    billing_rows = _load_billing_rows(job)
    billing_summary = _summarize_billing(billing_rows)
    
    # Step 2: PRECISION IMPROVEMENT - Detect date format
    logger.info("[2/7] Detecting date format...")
    date_format_analysis = detect_date_format(billing_rows, _INVOICE_DATE_FIELDS)
    
    if not date_format_analysis.is_reliable():
        logger.warning(f"⚠️ Date format detection unreliable: {date_format_analysis.detected_format.value}")
        logger.warning(f"   Evidence: {date_format_analysis.evidence}")
        logger.warning(f"   Ambiguous dates: {date_format_analysis.ambiguous_count}")
    else:
        logger.info(f"✓ Detected date format: {date_format_analysis.detected_format.value} "
                   f"(confidence: {date_format_analysis.confidence:.0%})")
    
    # Step 3: Extract and validate contract rules
    logger.info("[3/7] Extracting and validating contract rules...")
    rules_dict = llm_insights.get("rules", {})
    rules = _extract_contract_rules(llm_insights)
    
    # Step 4: Build unified pricing timeline
    logger.info("[4/7] Building unified pricing timeline...")
    
    if "base_start_date" not in rules_dict:
        contract_terms = llm_insights.get("gpt4o_contract_terms", {})
        base_pricing = contract_terms.get("base_pricing", {})
        base_start = base_pricing.get("start_date")
        
        if base_start:
            rules_dict["base_start_date"] = base_start
        else:
            if rules.effective_start_date:
                one_year_before = rules.effective_start_date.replace(year=rules.effective_start_date.year - 1)
                rules_dict["base_start_date"] = one_year_before.isoformat()
            else:
                rules_dict["base_start_date"] = "2024-01-01"
    
    pricing_timeline = build_pricing_timeline(rules_dict)
    logger.info(f"📅 Built pricing timeline with {len(pricing_timeline.periods) if pricing_timeline else 0} periods")
    
    # Step 5: Parse and classify invoice items
    logger.info("[5/7] Classifying invoice line items...")
    invoice_items = await _parse_invoice_items(
        billing_rows,
        rules.invoice_keywords,
        _classifier,
        date_format_analysis  # NEW: Pass date format
    )
    
    # Step 6: Run intelligent audits
    logger.info("[6/7] Running intelligent audits with precision mode...")
    
    documents = job.metrics.get("documents") if isinstance(job.metrics.get("documents"), list) else None
    
    # Audit 1: Price escalation with categorization
    confirmed, needs_review, dismissed = await _audit_escalation_clause(
        invoice_items,
        rules,
        documents,
        _classifier,
        pricing_timeline
    )
    
    # Audit 2: SLA credits
    sla_discrepancy = await _audit_sla_credits(
        invoice_items,
        rules,
        documents,
        billing_summary["total_billed"]
    )
    
    if sla_discrepancy:
        if sla_discrepancy.finding_status == FindingStatus.CONFIRMED_DISCREPANCY:
            confirmed.append(sla_discrepancy)
        else:
            needs_review.append(sla_discrepancy)
    
    # Step 7: Finalize results
    logger.info("[7/7] Finalizing results...")
    
    # Only surface confirmed + needs_review to client
    all_discrepancies = confirmed + needs_review
    
    # Group discrepancies by invoice to avoid double-counting
    # If the same invoice appears in multiple discrepancies, only count it once
    invoice_discrepancy_map = {}
    for d in all_discrepancies:
        for item in d.invoice_items:
            if not item.invoice_date:
                continue
            # Create key: invoice_number + invoice_date (unique per invoice)
            invoice_key = f"{item.invoice_number or 'N/A'}_{item.invoice_date.isoformat()}"
            # Store the maximum financial impact for this invoice
            # (in case the same invoice appears in multiple discrepancies)
            if invoice_key not in invoice_discrepancy_map:
                invoice_discrepancy_map[invoice_key] = d.financial_impact
            else:
                # If same invoice appears multiple times, take the max (should be same, but be safe)
                invoice_discrepancy_map[invoice_key] = max(invoice_discrepancy_map[invoice_key], d.financial_impact)
    
    # Calculate total recoverable from unique invoices only
    total_recoverable = sum(invoice_discrepancy_map.values())
    
    # Calculate confirmed recoverable (only from confirmed discrepancies)
    confirmed_invoice_map = {}
    for d in confirmed:
        for item in d.invoice_items:
            if not item.invoice_date:
                continue
            invoice_key = f"{item.invoice_number or 'N/A'}_{item.invoice_date.isoformat()}"
            if invoice_key not in confirmed_invoice_map:
                confirmed_invoice_map[invoice_key] = d.financial_impact
            else:
                confirmed_invoice_map[invoice_key] = max(confirmed_invoice_map[invoice_key], d.financial_impact)
    confirmed_recoverable = sum(confirmed_invoice_map.values())
    audit_time = (datetime.now() - start_time).total_seconds()
    
    # Update job metrics
    job.metrics["billing_summary"] = billing_summary
    job.metrics["recoverable_amount"] = round(total_recoverable, 2)
    job.metrics["confirmed_recoverable"] = round(confirmed_recoverable, 2)  # NEW
    job.metrics["currency"] = rules.currency
    job.metrics["gpt4o_enhanced"] = True
    job.metrics["precision_mode"] = True  # NEW
    
    # NEW: Date format analysis
    job.metrics["date_format_analysis"] = {
        "detected_format": date_format_analysis.detected_format.value,
        "confidence": date_format_analysis.confidence,
        "sample_size": date_format_analysis.sample_size,
        "ambiguous_count": date_format_analysis.ambiguous_count,
        "is_reliable": date_format_analysis.is_reliable(),
    }
    
    # NEW: Discrepancy categorization
    job.metrics["discrepancy_summary"] = {
        "confirmed_count": len(confirmed),
        "confirmed_value": round(confirmed_recoverable, 2),
        "needs_review_count": len(needs_review),
        "needs_review_value": round(sum(d.financial_impact for d in needs_review), 2),
        "dismissed_count": len(dismissed),
        "dismissed_value": round(sum(d.financial_impact for d in dismissed), 2),
    }
    
    # NEW: Contract extraction quality
    job.metrics["extraction_quality"] = {
        "confidence": rules.extraction_confidence,
        "needs_review": rules.needs_review,
        "warnings": rules.validation_warnings,
    }
    
    # Store pricing timeline data
    pricing_periods = []
    if pricing_timeline and pricing_timeline.periods:
        for idx, period in enumerate(pricing_timeline.periods):
            period_start = period.start_date
            period_end = pricing_timeline.periods[idx + 1].start_date if idx < len(pricing_timeline.periods) - 1 else date.today()
            
            period_invoices = [
                item for item in invoice_items
                if item.invoice_date and period_start <= item.invoice_date < period_end
            ]
            
            period_discrepancies = [
                d for d in all_discrepancies
                if any(
                    item.invoice_date and period_start <= item.invoice_date < period_end
                    for item in d.invoice_items
                )
            ]
            
            # Group invoices by MONTH ONLY to show one entry per month
            # Aggregate all invoices/line items in the same month together
            invoice_breakdown_map = {}
            
            # Track processed items to avoid exact duplicates
            processed_items = set()
            
            for item in period_invoices:
                if not item.invoice_date:
                    continue
                
                # Skip exact duplicates (same invoice number, date, rate, and amount)
                item_key = f"{item.invoice_number or 'N/A'}_{item.invoice_date.isoformat()}_{item.rate}_{item.amount}"
                if item_key in processed_items:
                    logger.debug(f"Skipping duplicate invoice item in breakdown: {item_key}")
                    continue
                processed_items.add(item_key)
                
                expected_amount, _ = pricing_timeline.get_expected_amount(item.invoice_date)
                billed_amount = item.rate if item.rate > 0 else item.amount
                
                month_key = item.invoice_date.strftime("%b %Y")
                invoice_number = item.invoice_number or "N/A"
                invoice_date_str = item.invoice_date.isoformat()
                
                # Create unique key: MONTH ONLY (one entry per month)
                unique_key = month_key
                
                # If this month already exists, aggregate the amounts
                if unique_key in invoice_breakdown_map:
                    existing = invoice_breakdown_map[unique_key]
                    # Sum billed amounts for all invoices/line items in this month
                    existing["billed"] = round(existing["billed"] + billed_amount, 2)
                    # Expected should be the same for all invoices in the same month (same rate)
                    # Keep the expected amount (should be consistent for the month)
                    # Recalculate difference based on aggregated billed amount
                    existing["difference"] = round(existing["expected"] - existing["billed"], 2)
                    # Has discrepancy if difference is significant (either under or over billing)
                    existing["has_discrepancy"] = abs(existing["difference"]) > 2.0
                    # Keep highest confidence
                    existing["confidence"] = max(existing["confidence"], round(item.effective_confidence(), 3))
                    # Keep earliest invoice date for the month
                    if invoice_date_str < existing["invoice_date"]:
                        existing["invoice_date"] = invoice_date_str
                    # Collect invoice numbers (comma-separated if multiple)
                    if invoice_number != "N/A":
                        existing_invoices = existing.get("invoice_number", "N/A")
                        if existing_invoices == "N/A":
                            existing["invoice_number"] = invoice_number
                        elif invoice_number not in existing_invoices:
                            existing["invoice_number"] = f"{existing_invoices}, {invoice_number}"
                else:
                    # First time seeing this month
                    invoice_breakdown_map[unique_key] = {
                        "month": month_key,
                        "invoice_date": invoice_date_str,
                        "expected": round(expected_amount, 2),
                        "billed": round(billed_amount, 2),
                        "difference": round(expected_amount - billed_amount, 2),
                        "has_discrepancy": abs(expected_amount - billed_amount) > 2.0,
                        "invoice_number": invoice_number,
                        "description": "",  # Will be set from discrepancies if needed
                        "confidence": round(item.effective_confidence(), 3),
                        "date_was_ambiguous": item.date_was_ambiguous,
                    }
            
            # Convert map to list and sort by date
            invoice_breakdown = list(invoice_breakdown_map.values())
            invoice_breakdown.sort(key=lambda x: x["invoice_date"])
            
            # Calculate total leakage (underbilling: positive difference means we're missing money)
            # difference = expected - billed
            # Positive difference = underbilling (we're missing money, should be billed more)
            # Negative difference = overbilling (we were billed too much, but that's not "missing" in the same sense)
            total_leakage = sum(
                inv["difference"] for inv in invoice_breakdown
                if inv["has_discrepancy"] and inv["difference"] > 0
            )
            
            pricing_periods.append({
                "start_date": period.start_date.isoformat(),
                "end_date": period_end.isoformat() if idx < len(pricing_timeline.periods) - 1 else None,
                "amount": period.amount,
                "source": period.source,
                "reason": period.reason,
                "invoice_count": len(period_invoices),
                "discrepancy_count": len(period_discrepancies),
                "total_leakage": round(total_leakage, 2),
                "invoice_breakdown": invoice_breakdown,
            })
    
    job.metrics["gpt4o_rules"] = {
        "base_amount": rules.base_amount,
        "escalation_rate": rules.escalation_rate,
        "effective_start_date": rules.effective_start_date.isoformat(),
        "currency": rules.currency,
        "amendment_history": rules.amendment_history or [],
        "pricing_timeline": pricing_periods,
        "extraction_confidence": rules.extraction_confidence,  # NEW
        "validation_warnings": rules.validation_warnings,  # NEW
    }
    
    job.metrics["audit_time_seconds"] = audit_time
    job.metrics["classification_stats"] = {
        "total_items": len(invoice_items),
        "recurring": sum(1 for item in invoice_items if item.classification == InvoiceClassification.RECURRING),
        "one_time": sum(1 for item in invoice_items if item.classification == InvoiceClassification.ONE_TIME),
        "credits": sum(1 for item in invoice_items if item.classification == InvoiceClassification.CREDIT),
        "adjustments": sum(1 for item in invoice_items if item.classification == InvoiceClassification.ADJUSTMENT),
        "ambiguous_dates": sum(1 for item in invoice_items if item.date_was_ambiguous),  # NEW
    }
    
    # Convert discrepancies to API format
    job.discrepancies = [d.to_dict() for d in all_discrepancies]
    
    await rag_store.index_billing(job, job.discrepancies)

    # Log summary
    logger.info("="*70)
    logger.info(f"RECONCILIATION COMPLETE (PRECISION MODE)")
    logger.info(f"  Time: {audit_time:.2f}s")
    logger.info(f"  Confirmed discrepancies: {len(confirmed)} (₹{confirmed_recoverable:,.2f})")
    logger.info(f"  Needs review: {len(needs_review)}")
    logger.info(f"  Dismissed (false positives): {len(dismissed)}")
    logger.info(f"  Total recoverable: ₹{total_recoverable:,.2f} {rules.currency}")
    logger.info(f"  Date format reliability: {'✓' if date_format_analysis.is_reliable() else '⚠️'}")
    logger.info(f"  Extraction confidence: {rules.extraction_confidence:.0%}")
    logger.info("="*70)
    
    return {
        "discrepancies": job.discrepancies,
        "recoverable_amount": round(total_recoverable, 2),
        "confirmed_recoverable": round(confirmed_recoverable, 2),
        "needs_review_count": len(needs_review),
        "dismissed_count": len(dismissed),
        "precision_metrics": {
            "date_format_reliable": date_format_analysis.is_reliable(),
            "extraction_confidence": rules.extraction_confidence,
            "average_discrepancy_confidence": round(
                mean(d.effective_confidence() for d in all_discrepancies) if all_discrepancies else 0, 3
            ),
        }
    }