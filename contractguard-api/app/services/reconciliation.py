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

BUG FIXES (v2):
8. Separate RECURRING_FIXED vs RECURRING_VARIABLE classification
9. Duplicate charge detection
10. Overage rate/quantity validation
11. Proper monthly aggregation excluding overages
"""

from __future__ import annotations

import csv
import json
import logging
import asyncio
import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
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
    OVERAGE_RATE_MISMATCH = "overage_rate_mismatch"
    OVERAGE_QUANTITY_MISMATCH = "overage_quantity_mismatch"


class Priority(Enum):
    """Priority levels for discrepancies."""
    CRITICAL = "critical"  # Definite financial loss
    HIGH = "high"         # Likely financial loss
    MEDIUM = "medium"     # Possible issue, needs review
    LOW = "low"          # Informational, monitor
    INFO = "info"        # Just tracking, no action needed


class InvoiceClassification(Enum):
    """Invoice line item classifications - NOW WITH FIXED VS VARIABLE DISTINCTION."""
    RECURRING_FIXED = "recurring_fixed"      # Base fee, add-ons (fixed monthly)
    RECURRING_VARIABLE = "recurring_variable" # Overages (variable monthly)
    RECURRING = "recurring"                   # Legacy - for backward compatibility
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
    extraction_confidence: float = 1.0
    needs_review: bool = False
    validation_warnings: List[str] = field(default_factory=list)
    
    # NEW: Overage rates from contract
    storage_overage_rate: Optional[float] = None
    storage_overage_unit: str = "TB"
    compute_overage_rate: Optional[float] = None
    compute_overage_unit: str = "vCPU"
    
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
    
    # Precision metadata
    date_parsing_confidence: float = 1.0
    date_was_ambiguous: bool = False
    classification_reason: str = ""
    
    # NEW: Additional fields for overage validation
    sku: str = ""
    quantity: float = 0.0
    unit_rate: float = 0.0
    parsed_quantity_from_desc: Optional[float] = None
    parsed_unit_from_desc: Optional[str] = None
    
    def is_after_date(self, cutoff_date: date) -> bool:
        """Check if invoice is after a date."""
        return self.invoice_date and self.invoice_date >= cutoff_date
    
    def is_likely_recurring(self) -> bool:
        """Check if this is likely a recurring charge (fixed OR variable)."""
        return (
            self.classification in (
                InvoiceClassification.RECURRING,
                InvoiceClassification.RECURRING_FIXED,
                InvoiceClassification.RECURRING_VARIABLE
            ) and
            self.confidence > 0.7
        )
    
    def is_fixed_recurring(self) -> bool:
        """Check if this is a FIXED recurring charge (base fee, add-ons)."""
        return (
            self.classification == InvoiceClassification.RECURRING_FIXED and
            self.confidence > 0.7
        )
    
    def is_variable_recurring(self) -> bool:
        """Check if this is a VARIABLE recurring charge (overages)."""
        return (
            self.classification == InvoiceClassification.RECURRING_VARIABLE and
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
    
    # Precision enhancements
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    finding_status: FindingStatus = FindingStatus.NEEDS_REVIEW
    validation_reason: str = ""
    
    def effective_confidence(self) -> float:
        """Calculate effective confidence from all signals."""
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
            "finding_status": self.finding_status.value,
            "validation_reason": self.validation_reason,
            "evidence": self.contract_evidence + [
                {
                    "type": "invoice_line_error",
                    "invoice_date": item.invoice_date.isoformat() if item.invoice_date else None,
                    "reference": item.invoice_number,
                    "description": item.description,
                    "found_rate": item.rate,
                    "classification": item.classification.value,
                    "confidence": round(item.effective_confidence(), 3),
                    "date_was_ambiguous": item.date_was_ambiguous,
                    "sku": item.sku,  # NEW
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

_AMOUNT_FIELDS = [
    "total_line_amount", "line_amount", "amount", "Amount",
    "value", "Value", "total", "Total", "charge", "Charge",
    "billed", "Billed", "subtotal", "Subtotal"
]
_CUSTOMER_FIELDS = ["Customer", "customer", "Account", "account", "Client", "client", "Company", "company", "Name"]
_INVOICE_DATE_FIELDS = ["Invoice_Date", "invoice_date", "Date", "date", "InvoiceDate"]
_INVOICE_FIELDS = ["InvoiceNumber", "invoiceNumber", "Invoice", "invoice", "Number", "number", "Id", "ID", "Invoice_No"]
_DESC_FIELDS = ["line_description", "Item_Desc", "item_desc", "Description", "description", "Memo", "memo", "Activity"]
_RATE_FIELDS = ["unit_price", "Rate", "rate", "Unit Price", "unit_price", "Price", "unitprice"]
_SKU_FIELDS = ["sku", "SKU", "product_code", "ProductCode", "item_code", "ItemCode"]
_QTY_FIELDS = ["quantity", "Quantity", "qty", "Qty", "units", "Units"]

def deduplicate_billing_rows(rows: list, invoice_fields: list = None) -> list:
    """
    Deduplicate billing rows by invoice number.
    
    When multiple billing files contain the same invoice, keep only one copy.
    Priority: Keep the row from the more "authoritative" file (not scenario files).
    
    Args:
        rows: List of billing row dictionaries
        invoice_fields: List of possible column names for invoice number
    
    Returns:
        Deduplicated list of rows
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if invoice_fields is None:
        invoice_fields = [
            "Invoice_No", "invoice_no", "InvoiceNumber", "invoiceNumber",
            "Invoice", "invoice", "Number", "Id", "ID"
        ]
    
    # Track invoices we've seen
    seen_invoices = {}
    duplicates_removed = 0
    
    # Sort rows to prioritize non-scenario files
    def file_priority(row):
        source = str(row.get("__source_file", "")).lower()
        if "scenario" in source:
            return 1  # Lower priority
        return 0  # Higher priority
    
    sorted_rows = sorted(rows, key=file_priority)
    
    for row in sorted_rows:
        # Find invoice number
        invoice_no = None
        for field in invoice_fields:
            if field in row and row[field]:
                invoice_no = str(row[field]).strip()
                break
        
        if not invoice_no:
            # No invoice number - keep but can't deduplicate
            if invoice_no not in seen_invoices:
                seen_invoices[f"__no_inv_{len(seen_invoices)}"] = row
            continue
        
        # Normalize invoice number (remove suffixes like -CR, -OV, -DUP for base matching)
        # But keep full invoice_no for unique identification
        if invoice_no in seen_invoices:
            duplicates_removed += 1
            source = row.get("__source_file", "unknown")
            existing_source = seen_invoices[invoice_no].get("__source_file", "unknown")
            logger.debug(f"Duplicate {invoice_no}: keeping from {existing_source}, skipping from {source}")
        else:
            seen_invoices[invoice_no] = row
    
    result = list(seen_invoices.values())
    
    if duplicates_removed > 0:
        logger.info(f"📊 Deduplicated billing: {len(rows)} → {len(result)} rows ({duplicates_removed} duplicates removed)")
    
    return result


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


def _parse_quantity_from_description(description: str) -> Tuple[Optional[float], Optional[str]]:
    """
    Extract quantity and unit from description.
    E.g., "Storage overage (4 TB)" -> (4.0, "TB")
    """
    patterns = [
        r'\((\d+(?:\.\d+)?)\s*(TB|GB|vCPU|vCPUs|users?|seats?)\)',  # (4 TB)
        r'(\d+(?:\.\d+)?)\s*(TB|GB|vCPU|vCPUs|users?|seats?)',       # 4 TB
    ]
    
    for pattern in patterns:
        match = re.search(pattern, description, re.IGNORECASE)
        if match:
            quantity = float(match.group(1))
            unit = match.group(2).upper().rstrip('S')  # Normalize: vCPUs -> VCPU
            return (quantity, unit)
    
    return (None, None)


# ============================================================================
# GPT-4O INTELLIGENT CLASSIFIER (ENHANCED)
# ============================================================================

class IntelligentClassifier:
    """Production-grade GPT-4o classifier with tenant-isolated caching."""
    
    def __init__(self, customer_id: str, job_id: str):
        """Initialize classifier with tenant isolation."""
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
    
    def _deterministic_classification(self, description: str, amount: float, sku: str = "") -> Tuple[InvoiceClassification, float, str]:
        """
        Fast, deterministic classification with FIXED vs VARIABLE distinction.
        Returns: (classification, confidence, reasoning)
        """
        desc_lower = description.lower()
        sku_lower = sku.lower() if sku else ""
        
        # CREDITS (negative amounts)
        if amount < 0:
            return (InvoiceClassification.CREDIT, 0.99, "Negative amount indicates credit/refund")
        
        # ============================================
        # 🔥 NEW: OVERAGE KEYWORDS (VARIABLE recurring)
        # ============================================
        overage_keywords = [
            "overage", "over-", "additional", "excess", "extra",
            "per tb", "per vcpu", "per user", "per seat", "usage",
            "consumption", "metered", "variable"
        ]
        if any(kw in desc_lower for kw in overage_keywords):
            matched = [kw for kw in overage_keywords if kw in desc_lower][0]
            return (InvoiceClassification.RECURRING_VARIABLE, 0.95, f"Overage keyword: '{matched}'")
        
        # SKU-based overage detection
        overage_skus = ["ovr", "usage", "metered", "variable", "excess"]
        if any(kw in sku_lower for kw in overage_skus):
            return (InvoiceClassification.RECURRING_VARIABLE, 0.90, f"Overage SKU pattern: '{sku}'")
        
        # OBVIOUS ONE-TIME
        onetime_keywords = [
            "implementation", "setup", "onboarding", "installation", "migration",
            "training", "workshop", "initial", "one-time", "wrap-up", "kickoff",
            "consulting", "professional services", "project", "data migration"
        ]
        if any(kw in desc_lower for kw in onetime_keywords):
            matched = [kw for kw in onetime_keywords if kw in desc_lower][0]
            return (InvoiceClassification.ONE_TIME, 0.95, f"Matched one-time keyword: '{matched}'")
        
        # ============================================
        # 🔥 NEW: FIXED RECURRING KEYWORDS
        # ============================================
        fixed_recurring_keywords = [
            "base", "platform fee", "subscription", "license", "monthly fee",
            "annual fee", "saas", "managed service", "hosting", "infrastructure",
            "audit logs", "package", "plan", "tier", "monthly service"
        ]
        if any(kw in desc_lower for kw in fixed_recurring_keywords):
            matched = [kw for kw in fixed_recurring_keywords if kw in desc_lower][0]
            return (InvoiceClassification.RECURRING_FIXED, 0.95, f"Fixed recurring keyword: '{matched}'")
        
        # ADJUSTMENTS
        adjustment_keywords = ["adjustment", "correction", "pro-rata", "prorata", "partial month"]
        if any(kw in desc_lower for kw in adjustment_keywords):
            matched = [kw for kw in adjustment_keywords if kw in desc_lower][0]
            return (InvoiceClassification.ADJUSTMENT, 0.90, f"Matched adjustment keyword: '{matched}'")
        
        # Default for large amounts: assume FIXED recurring
        if amount >= 10000:
            return (InvoiceClassification.RECURRING_FIXED, 0.6, "Large amount suggests fixed recurring")
        
        # UNKNOWN - needs GPT-4o
        return (InvoiceClassification.UNKNOWN, 0.3, "Ambiguous description - needs AI classification")
    
    async def classify_line_item(
        self,
        description: str,
        amount: float,
        invoice_date: Optional[date] = None,
        contract_keywords: Optional[List[str]] = None,
        sku: str = ""
    ) -> Tuple[InvoiceClassification, float, str]:
        """
        Classify invoice line item with high accuracy.
        Returns: (classification, confidence, reasoning)
        """
        # Check cache
        cache_key = f"{description.lower().strip()}_{amount}_{sku}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        # Try deterministic classification first (covers 90% of cases)
        classification, confidence, reasoning = self._deterministic_classification(description, amount, sku)
        
        if classification != InvoiceClassification.UNKNOWN:
            result = (classification, confidence, reasoning)
            self.cache[cache_key] = result
            return result
        
        # Use GPT-4o for ambiguous cases
        if not self.enabled:
            # Fallback to heuristic
            if amount > 50000:
                result = (InvoiceClassification.RECURRING_FIXED, 0.6, "Large amount suggests fixed recurring (fallback)")
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
                result = (InvoiceClassification.RECURRING_FIXED, 0.6, f"Rate limit hit, using fallback: {error_msg}")
            else:
                result = (InvoiceClassification.UNKNOWN, 0.4, f"Rate limit hit: {error_msg}")
            self.cache[cache_key] = result
            return result
        
        try:
            prompt = f"""Classify this invoice line: RECURRING_FIXED, RECURRING_VARIABLE, ONE_TIME, or ADJUSTMENT?

Description: {description}
Amount: {amount}
SKU: {sku or "N/A"}
{f"Date: {invoice_date}" if invoice_date else ""}
{f"Contract services: {', '.join(contract_keywords[:5])}" if contract_keywords else ""}

RECURRING_FIXED = monthly/annual subscription, platform fee, base fee, license (same amount each month)
RECURRING_VARIABLE = overage charges, usage fees, per-unit charges (varies based on usage)
ONE_TIME = setup, implementation, training, consulting, migration
ADJUSTMENT = pro-rata, credit, partial month, correction

JSON only: {{"classification": "RECURRING_FIXED|RECURRING_VARIABLE|ONE_TIME|ADJUSTMENT", "confidence": 0.0-1.0, "reasoning": "..."}}"""

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
                "RECURRING_FIXED": InvoiceClassification.RECURRING_FIXED,
                "RECURRING_VARIABLE": InvoiceClassification.RECURRING_VARIABLE,
                "RECURRING": InvoiceClassification.RECURRING_FIXED,  # Legacy mapping
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

ANALYSIS:
Could this difference be explained by:
1. Pro-rata (partial month service)?
2. Service credit applied?
3. Volume discount?
4. Data entry error?
5. Legitimate one-time adjustment?

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
    date_format_analysis: DateFormatAnalysis
) -> List[InvoiceLineItem]:
    """
    Parse and classify all invoice line items.
    NOW WITH FIXED VS VARIABLE DISTINCTION.
    """
    logger.info(f"Parsing {len(rows)} invoice rows...")
    logger.info(f"Using detected date format: {date_format_analysis.detected_format.value} "
                f"(confidence: {date_format_analysis.confidence:.0%})")
    
    items = []
    tasks = []
    
    for row in rows:
        description = str(_extract_field(row, _DESC_FIELDS) or "")
        amount = _to_float(_extract_field(row, _AMOUNT_FIELDS))
        
        if amount == 0:
            if "total_line_amount" in row:
                amount = _to_float(row["total_line_amount"])
            elif "line_amount" in row:
                amount = _to_float(row["line_amount"])

        rate = _to_float(_extract_field(row, _RATE_FIELDS))
        quantity = _to_float(_extract_field(row, _QTY_FIELDS))
        sku = str(_extract_field(row, _SKU_FIELDS) or "")
        
        # Calculate unit_rate if we have quantity
        unit_rate = 0.0
        if rate == 0:
            unit = _to_float(row.get("unit_price") or row.get("Unit Price"))
            qty = _to_float(row.get("quantity") or row.get("Quantity"))
            if unit > 0 and qty > 0:
                rate = unit * qty
                unit_rate = unit
            elif amount > 0 and quantity > 0:
                unit_rate = amount / quantity
        else:
            unit_rate = rate
        
        if rate == 0.0 and amount > 0:
            rate = amount
        
        # Parse date with detected format
        raw_date = _extract_field(row, _INVOICE_DATE_FIELDS)
        invoice_date, date_confidence = parse_date_with_format(
            raw_date,
            date_format_analysis.detected_format
        )
        
        date_was_ambiguous = (
            date_format_analysis.detected_format in (DateFormat.AMBIGUOUS, DateFormat.MIXED) or
            date_confidence < 0.8
        )
        
        invoice_number = str(_extract_field(row, _INVOICE_FIELDS) or "")
        
        # Parse quantity from description for validation
        parsed_qty, parsed_unit = _parse_quantity_from_description(description)
        
        tasks.append({
            "row": row,
            "description": description,
            "amount": amount,
            "rate": rate,
            "invoice_date": invoice_date,
            "invoice_number": invoice_number,
            "date_confidence": date_confidence,
            "date_was_ambiguous": date_was_ambiguous,
            "sku": sku,
            "quantity": quantity,
            "unit_rate": unit_rate,
            "parsed_qty": parsed_qty,
            "parsed_unit": parsed_unit,
        })
    
    # Batch classify all items
    classifications = await asyncio.gather(*[
        classifier.classify_line_item(
            t["description"],
            t["amount"],
            t["invoice_date"],
            contract_keywords,
            t["sku"]  # NEW: Pass SKU
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
            sku=task["sku"],
            quantity=task["quantity"],
            unit_rate=task["unit_rate"],
            parsed_quantity_from_desc=task["parsed_qty"],
            parsed_unit_from_desc=task["parsed_unit"],
        ))
    
    # Log classification summary
    recurring_fixed = sum(1 for item in items if item.classification == InvoiceClassification.RECURRING_FIXED)
    recurring_variable = sum(1 for item in items if item.classification == InvoiceClassification.RECURRING_VARIABLE)
    recurring_legacy = sum(1 for item in items if item.classification == InvoiceClassification.RECURRING)
    onetime = sum(1 for item in items if item.classification == InvoiceClassification.ONE_TIME)
    credits = sum(1 for item in items if item.classification == InvoiceClassification.CREDIT)
    adjustments = sum(1 for item in items if item.classification == InvoiceClassification.ADJUSTMENT)
    ambiguous_dates = sum(1 for item in items if item.date_was_ambiguous)
    
    logger.info(f"Classification: {recurring_fixed} fixed recurring, {recurring_variable} variable (overages), "
                f"{recurring_legacy} legacy recurring, {onetime} one-time, {credits} credits, {adjustments} adjustments")
    if ambiguous_dates > 0:
        logger.warning(f"⚠️ {ambiguous_dates} invoices have ambiguous dates - reduced confidence")
    
    return items


# ============================================================================
# 🔥 NEW AUDIT: DUPLICATE CHARGE DETECTION
# ============================================================================

async def _audit_duplicate_charges(
    invoice_items: List[InvoiceLineItem],
    rules: ContractRules,
    documents: List[Dict[str, Any]],
) -> List[Discrepancy]:
    """
    Detect duplicate charges within the same invoice/period.
    
    Key insight: If the same SKU appears twice in the same invoice,
    it's likely a duplicate unless it's an overage (which can legitimately vary).
    """
    discrepancies = []
    
    # Filter only FIXED recurring items (not overages - those can legitimately have multiples)
    fixed_items = [
        item for item in invoice_items
        if item.classification == InvoiceClassification.RECURRING_FIXED
        and item.invoice_date
    ]
    
    # Group by invoice_date + SKU
    groups: Dict[str, List[InvoiceLineItem]] = defaultdict(list)
    for item in fixed_items:
        key = f"{item.invoice_date.isoformat()}_{item.sku}"
        groups[key].append(item)
    
    for key, group_items in groups.items():
        if len(group_items) <= 1:
            continue
        
        # Multiple items with same SKU on same date = likely duplicate
        total_charged = sum(item.amount for item in group_items)
        expected_single = group_items[0].amount
        overcharge = total_charged - expected_single
        
        if overcharge <= 0:
            continue
        
        # Check if there's a credit that offsets this
        invoice_date = group_items[0].invoice_date
        credits_on_date = [
            item for item in invoice_items
            if item.classification == InvoiceClassification.CREDIT
            and item.invoice_date == invoice_date
        ]
        total_credits = abs(sum(c.amount for c in credits_on_date))
        
        # Net overcharge after credits
        net_overcharge = overcharge - total_credits
        
        if net_overcharge <= 0:
            logger.info(f"✓ Duplicate on {invoice_date} fully offset by credits")
            continue
        
        contract_evidence = _get_clause_references(documents, "billing", limit=1)
        
        discrepancies.append(Discrepancy(
            type=DiscrepancyType.DUPLICATE_CHARGE,
            priority=Priority.CRITICAL,
            title=f"Duplicate charge: {group_items[0].description[:50]}",
            description=(
                f"SKU '{group_items[0].sku}' charged {len(group_items)} times "
                f"on {invoice_date}. Total: ₹{total_charged:,.0f}, "
                f"Expected: ₹{expected_single:,.0f}. "
                f"Credits applied: ₹{total_credits:,.0f}. "
                f"Net overcharge: ₹{net_overcharge:,.0f}"
            ),
            financial_impact=net_overcharge,
            invoice_items=group_items + credits_on_date,
            contract_evidence=contract_evidence,
            confidence=0.95,
            recommendations=[
                f"Request credit for duplicate charge: ₹{net_overcharge:,.0f}",
                "Verify only one base fee should be charged per period",
            ],
            finding_status=FindingStatus.CONFIRMED_DISCREPANCY,
            validation_reason="Same SKU charged multiple times in same invoice",
        ))
    
    logger.info(f"✓ Duplicate audit: {len(discrepancies)} duplicate charge issues found")
    return discrepancies


# ============================================================================
# 🔥 NEW AUDIT: OVERAGE RATE/QUANTITY VALIDATION
# ============================================================================

async def _audit_overage_charges(
    invoice_items: List[InvoiceLineItem],
    rules: ContractRules,
    documents: List[Dict[str, Any]],
) -> List[Discrepancy]:
    """
    Validate overage charges against contract rates.
    
    Checks:
    1. Unit rate matches contract
    2. Quantity matches description (if parseable)
    """
    discrepancies = []
    
    # Filter overage items
    overage_items = [
        item for item in invoice_items
        if item.classification == InvoiceClassification.RECURRING_VARIABLE
        and item.invoice_date
    ]
    
    for item in overage_items:
        desc_lower = item.description.lower()
        
        # Determine overage type and expected rate
        expected_rate = None
        overage_type = None
        
        if "storage" in desc_lower or "tb" in desc_lower or "gb" in desc_lower:
            expected_rate = rules.storage_overage_rate
            overage_type = "storage"
        elif "compute" in desc_lower or "vcpu" in desc_lower or "cpu" in desc_lower:
            expected_rate = rules.compute_overage_rate
            overage_type = "compute"
        
        # CHECK 1: Quantity mismatch (description vs billed)
        if item.parsed_quantity_from_desc is not None and item.quantity > 0:
            if item.parsed_quantity_from_desc != item.quantity:
                qty_diff = item.quantity - item.parsed_quantity_from_desc
                
                # Calculate impact using unit_rate or expected_rate
                rate_to_use = item.unit_rate if item.unit_rate > 0 else (expected_rate or 0)
                impact = qty_diff * rate_to_use
                
                if abs(impact) > 100:  # Only flag if significant
                    contract_evidence = _get_clause_references(documents, "billing", limit=1)
                    
                    discrepancies.append(Discrepancy(
                        type=DiscrepancyType.OVERAGE_QUANTITY_MISMATCH,
                        priority=Priority.MEDIUM,
                        title=f"Quantity mismatch: {overage_type or 'overage'} ({item.invoice_date})",
                        description=(
                            f"Description says '{item.parsed_quantity_from_desc} {item.parsed_unit_from_desc}', "
                            f"but billed for {item.quantity} units. "
                            f"Potential overcharge: ₹{abs(impact):,.0f}"
                        ),
                        financial_impact=abs(impact) if impact > 0 else 0,
                        invoice_items=[item],
                        contract_evidence=contract_evidence,
                        confidence=0.80,
                        recommendations=[
                            "Verify actual usage for this period",
                            f"Description indicates {item.parsed_quantity_from_desc} {item.parsed_unit_from_desc}",
                            f"Billed quantity: {item.quantity}",
                        ],
                        finding_status=FindingStatus.NEEDS_REVIEW,
                        validation_reason="Billed quantity differs from description",
                    ))
        
        # CHECK 2: Rate mismatch (if we have contract rate)
        if expected_rate and expected_rate > 0 and item.unit_rate > 0:
            if abs(item.unit_rate - expected_rate) > 1:  # More than ₹1 difference
                rate_diff = item.unit_rate - expected_rate
                quantity_used = item.quantity if item.quantity > 0 else 1
                impact = rate_diff * quantity_used
                
                if abs(impact) > 100:
                    contract_evidence = _get_clause_references(documents, "pricing", limit=1)
                    
                    discrepancies.append(Discrepancy(
                        type=DiscrepancyType.OVERAGE_RATE_MISMATCH,
                        priority=Priority.HIGH,
                        title=f"Incorrect {overage_type} overage rate ({item.invoice_date})",
                        description=(
                            f"Charged ₹{item.unit_rate:,.0f}/{rules.storage_overage_unit if overage_type == 'storage' else rules.compute_overage_unit}, "
                            f"contract says ₹{expected_rate:,.0f}. "
                            f"Overcharge: ₹{abs(impact):,.0f}"
                        ),
                        financial_impact=abs(impact) if impact > 0 else 0,
                        invoice_items=[item],
                        contract_evidence=contract_evidence,
                        confidence=0.90,
                        recommendations=[
                            f"Verify contract {overage_type} overage rate",
                            f"Contract rate: ₹{expected_rate:,.0f}",
                            f"Billed rate: ₹{item.unit_rate:,.0f}",
                        ],
                        finding_status=FindingStatus.CONFIRMED_DISCREPANCY,
                        validation_reason="Unit rate exceeds contract rate",
                    ))
    
    logger.info(f"✓ Overage audit: {len(discrepancies)} overage issues found")
    return discrepancies


# ============================================================================
# 🔥 FIXED: ESCALATION AUDIT (ONLY FIXED RECURRING)
# ============================================================================

async def _audit_escalation_clause(
    invoice_items: List[InvoiceLineItem],
    rules: ContractRules,
    documents: List[Dict[str, Any]],
    classifier: IntelligentClassifier,
    pricing_timeline
) -> Tuple[List[Discrepancy], List[Discrepancy], List[Discrepancy]]:
    """
    Audit FIXED recurring charges using MONTHLY aggregation.
    
    🔥 KEY FIX: Only include RECURRING_FIXED items, NOT overages!
    """

    # 🔥 FIX: Filter only FIXED recurring items (exclude overages)
    fixed_recurring_items = [
        item for item in invoice_items
        if item.is_fixed_recurring() and item.invoice_date
    ]
    
    if not fixed_recurring_items:
        # Fallback: try legacy RECURRING classification
        fixed_recurring_items = [
            item for item in invoice_items
            if item.classification == InvoiceClassification.RECURRING
            and item.invoice_date
            and not any(kw in item.description.lower() for kw in ["overage", "over-", "additional", "excess"])
        ]
    
    if not fixed_recurring_items:
        logger.warning("No fixed recurring items found for escalation audit")
        return [], [], []

    logger.info(f"Running escalation audit with {len(fixed_recurring_items)} FIXED recurring items")

    # Group by month
    monthly_groups = defaultdict(list)
    for item in fixed_recurring_items:
        month_key = item.invoice_date.strftime("%Y-%m")
        monthly_groups[month_key].append(item)

    confirmed_discrepancies = []
    needs_review_discrepancies = []
    dismissed_discrepancies = []

    contract_evidence = _get_clause_references(documents, "cpi_uplift", limit=2)
    has_contract_evidence = len(contract_evidence) > 0

    for month_key, month_items in monthly_groups.items():
        representative_date = month_items[0].invoice_date
        
        # Get expected amount from pricing timeline
        expected_amount, reason = pricing_timeline.get_expected_amount(representative_date)

        # 🔥 FIX: Sum FIXED recurring only, DEDUPLICATE by SKU
        seen_skus = set()
        actual_billed = 0.0
        unique_items = []
        
        for item in month_items:
            if item.sku in seen_skus:
                continue  # Skip duplicates (handled by duplicate audit)
            seen_skus.add(item.sku)
            actual_billed += item.rate if item.rate > 0 else item.amount
            unique_items.append(item)

        difference = expected_amount - actual_billed

        logger.info(
            f"[{month_key}] expected={expected_amount:,.0f}, billed={actual_billed:,.0f}, diff={difference:,.0f}"
        )

        # Tolerance check
        tolerance_result = check_amount_tolerance(expected_amount, actual_billed)
        if tolerance_result.is_within_tolerance:
            logger.info(f"[{month_key}] ✓ Within tolerance: {tolerance_result.reason}")
            continue

        # Pro-rata check
        pro_rata = detect_pro_rata(actual_billed, expected_amount, month_items[0].description)
        if pro_rata.is_likely_pro_rata and pro_rata.confidence > 0.7:
            logger.info(f"[{month_key}] ✓ Pro-rata detected: {pro_rata.reason}")
            continue

        # GPT validation
        primary_item = max(unique_items, key=lambda x: x.effective_confidence())
        is_valid, validation_conf, validation_reason, action = await classifier.validate_discrepancy(
            primary_item,
            expected_amount,
            f"Expected monthly FIXED charge ₹{expected_amount:,.0f}. {reason}"
        )

        if not is_valid:
            logger.info(f"[{month_key}] False positive removed: {validation_reason}")
            dismissed_discrepancies.append(Discrepancy(
                type=DiscrepancyType.INCORRECT_RATE,
                priority=Priority.LOW,
                title=f"Dismissed: {month_key}",
                description=validation_reason,
                financial_impact=difference,
                invoice_items=unique_items,
                contract_evidence=[],
                confidence=0.3,
                recommendations=[],
                finding_status=FindingStatus.LIKELY_FALSE_POSITIVE,
                validation_reason=validation_reason,
            ))
            continue

        # Build confidence
        confidence_builder = ConfidenceBuilder()
        confidence_builder.with_classification(
            primary_item.confidence, primary_item.classification_reason
        )
        confidence_builder.with_date_parsing(
            primary_item.date_parsing_confidence,
            "Date parsed reliably" if not primary_item.date_was_ambiguous else "Ambiguous date"
        )
        confidence_builder.with_amount_match(
            1.0 - tolerance_result.percentage_difference,
            f"Monthly difference: ₹{abs(difference):,.0f} ({tolerance_result.percentage_difference*100:.1f}%)"
        )
        confidence_builder.with_contract_extraction(
            rules.extraction_confidence,
            "Contract extracted reliably"
        )
        confidence_builder.with_validation(validation_conf, validation_reason)

        if not has_contract_evidence:
            confidence_builder.with_additional_factor(
                "Contract Evidence",
                CONFIDENCE_REDUCTION_NO_CONTRACT_EVIDENCE,
                1.0,
                "No matching escalation clause found"
            )

        confidence_breakdown = confidence_builder.build()
        overall_confidence = confidence_breakdown.overall()

        # Classify finding
        finding_status = classify_finding(
            confidence=overall_confidence,
            financial_impact=difference,
            has_contract_evidence=has_contract_evidence,
            validation_passed=is_valid and validation_conf > 0.7
        )

        if finding_status == FindingStatus.CONFIRMED_DISCREPANCY:
            priority = Priority.CRITICAL if abs(difference) > rules.base_amount * 0.1 else Priority.HIGH
        elif finding_status == FindingStatus.NEEDS_REVIEW:
            priority = Priority.MEDIUM
        else:
            priority = Priority.LOW

        discrepancy = Discrepancy(
            type=DiscrepancyType.MISSING_ESCALATION if difference > 0 else DiscrepancyType.INCORRECT_RATE,
            priority=priority,
            title=f"Incorrect fixed recurring amount ({month_key})",
            description=(
                f"For {month_key}, billed ₹{actual_billed:,.2f} "
                f"instead of expected ₹{expected_amount:,.2f}. {reason}"
            ),
            financial_impact=difference,
            invoice_items=unique_items,
            contract_evidence=contract_evidence,
            confidence=overall_confidence,
            recommendations=[
                f"Review {len(unique_items)} fixed recurring charges for {month_key}",
                f"Expected: ₹{expected_amount:,.2f} {rules.currency}",
                f"Actual billed: ₹{actual_billed:,.2f}",
                f"Action: {action}",
            ],
            confidence_breakdown=confidence_breakdown,
            finding_status=finding_status,
            validation_reason=validation_reason,
        )

        if finding_status == FindingStatus.CONFIRMED_DISCREPANCY:
            confirmed_discrepancies.append(discrepancy)
        elif finding_status == FindingStatus.NEEDS_REVIEW:
            needs_review_discrepancies.append(discrepancy)
        else:
            dismissed_discrepancies.append(discrepancy)

    logger.info(f"✓ Escalation audit: {len(confirmed_discrepancies)} confirmed, "
                f"{len(needs_review_discrepancies)} needs review, "
                f"{len(dismissed_discrepancies)} dismissed")

    return confirmed_discrepancies, needs_review_discrepancies, dismissed_discrepancies


# ============================================================================
# SLA CREDIT AUDIT
# ============================================================================

async def _audit_sla_credits(
    invoice_items: List[InvoiceLineItem],
    rules: ContractRules,
    documents: List[Dict[str, Any]],
    total_billed: float
) -> Optional[Discrepancy]:
    """Audit for missing SLA credits with intelligent detection."""
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
    """Extract and validate contract rules from LLM insights."""
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
    
    # 🔥 NEW: Extract overage rates
    storage_overage_rate = rules_data.get("storage_overage_rate")
    compute_overage_rate = rules_data.get("compute_overage_rate")
    
    # Try to extract from contract text if not in rules
    if not storage_overage_rate or not compute_overage_rate:
        for doc in llm_insights.get("documents", []):
            full_text = doc.get("full_text", "")
            if full_text:
                # Storage overage pattern
                storage_match = re.search(
                    r'Storage\s*Overage\s*[:=-]?\s*(?:INR|₹|\$)?\s*([\d,]+)\s*(?:per|/)\s*(TB|GB)',
                    full_text, re.IGNORECASE
                )
                if storage_match and not storage_overage_rate:
                    storage_overage_rate = float(storage_match.group(1).replace(",", ""))
                    logger.info(f"Extracted storage overage rate: ₹{storage_overage_rate}/{storage_match.group(2)}")
                
                # Compute overage pattern
                compute_match = re.search(
                    r'Compute\s*Overage\s*[:=-]?\s*(?:INR|₹|\$)?\s*([\d,]+)\s*(?:per|/)\s*(vCPU|CPU)',
                    full_text, re.IGNORECASE
                )
                if compute_match and not compute_overage_rate:
                    compute_overage_rate = float(compute_match.group(1).replace(",", ""))
                    logger.info(f"Extracted compute overage rate: ₹{compute_overage_rate}/{compute_match.group(2)}")
    
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
        storage_overage_rate=storage_overage_rate,
        compute_overage_rate=compute_overage_rate,
    )
    
    is_valid, issues = rules.validate()
    if not is_valid:
        logger.warning(f"Contract rules validation issues: {', '.join(issues)}")
    else:
        if amendment_history:
            logger.info(f"✓ Amendment history: {len(amendment_history)} price changes tracked")
        logger.info(f"✓ Final rules: base={base_amount}, escalation={escalation_rate*100}%, effective={effective_date}")
        logger.info(f"✓ Overage rates: storage=₹{storage_overage_rate}/TB, compute=₹{compute_overage_rate}/vCPU")
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
    
    🔥 FIXES IN THIS VERSION:
    1. Separate RECURRING_FIXED vs RECURRING_VARIABLE
    2. Duplicate charge detection
    3. Overage rate/quantity validation
    4. Proper monthly aggregation (fixed only)
    """
    await job_manager.simulate_latency(0.1)
    
    logger.info("="*70)
    logger.info("STARTING INTELLIGENT RECONCILIATION (PRECISION MODE v2)")
    logger.info("="*70)
    
    start_time = datetime.now()
    
    # Create tenant-isolated classifier
    customer_id = job.customer_id or "default"
    _classifier = IntelligentClassifier(customer_id=customer_id, job_id=job.id)
    
    # Step 1: Load billing data
    logger.info("[1/8] Loading billing data...")
    billing_rows = _load_billing_rows(job)
    # 🔥 FIX: Deduplicate invoices across files
    billing_rows = deduplicate_billing_rows(billing_rows)
    billing_summary = _summarize_billing(billing_rows)
    
    # Step 2: Detect date format
    logger.info("[2/8] Detecting date format...")
    date_format_analysis = detect_date_format(billing_rows, _INVOICE_DATE_FIELDS)
    
    if not date_format_analysis.is_reliable():
        logger.warning(f"⚠️ Date format detection unreliable: {date_format_analysis.detected_format.value}")
    else:
        logger.info(f"✓ Detected date format: {date_format_analysis.detected_format.value} "
                   f"(confidence: {date_format_analysis.confidence:.0%})")
    
    # Step 3: Extract and validate contract rules
    logger.info("[3/8] Extracting and validating contract rules...")
    rules_dict = llm_insights.get("rules", {})
    rules = _extract_contract_rules(llm_insights)
    
    # Step 4: Build unified pricing timeline
    logger.info("[4/8] Building unified pricing timeline...")
    
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
    logger.info("[5/8] Classifying invoice line items...")
    invoice_items = await _parse_invoice_items(
        billing_rows,
        rules.invoice_keywords,
        _classifier,
        date_format_analysis
    )
    
    # Step 6: Run intelligent audits
    logger.info("[6/8] Running intelligent audits...")
    
    documents = job.metrics.get("documents") if isinstance(job.metrics.get("documents"), list) else None
    
    # 🔥 NEW: Audit 1 - Duplicate charges
    duplicate_discrepancies = await _audit_duplicate_charges(
        invoice_items,
        rules,
        documents,
    )
    
    # 🔥 NEW: Audit 2 - Overage rate/quantity validation
    overage_discrepancies = await _audit_overage_charges(
        invoice_items,
        rules,
        documents,
    )
    
    # Audit 3: Fixed recurring escalation (FIXED to exclude overages)
    confirmed, needs_review, dismissed = await _audit_escalation_clause(
        invoice_items,
        rules,
        documents,
        _classifier,
        pricing_timeline
    )
    
    # Audit 4: SLA credits
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
    
    # Combine all discrepancies
    confirmed.extend(duplicate_discrepancies)  # Duplicates are always confirmed
    needs_review.extend(overage_discrepancies)  # Overage issues need review
    
    # Step 7: Finalize results
    logger.info("[7/8] Finalizing results...")
    
    all_discrepancies = confirmed + needs_review
    
    # Calculate totals (avoid double-counting same invoice)
    invoice_discrepancy_map = {}
    for d in all_discrepancies:
        for item in d.invoice_items:
            if not item.invoice_date:
                continue
            invoice_key = f"{item.invoice_number or 'N/A'}_{item.invoice_date.isoformat()}_{d.type.value}"
            if invoice_key not in invoice_discrepancy_map:
                invoice_discrepancy_map[invoice_key] = d.financial_impact
            else:
                invoice_discrepancy_map[invoice_key] = max(invoice_discrepancy_map[invoice_key], d.financial_impact)
    
    total_recoverable = sum(invoice_discrepancy_map.values())
    
    confirmed_invoice_map = {}
    for d in confirmed:
        for item in d.invoice_items:
            if not item.invoice_date:
                continue
            invoice_key = f"{item.invoice_number or 'N/A'}_{item.invoice_date.isoformat()}_{d.type.value}"
            if invoice_key not in confirmed_invoice_map:
                confirmed_invoice_map[invoice_key] = d.financial_impact
            else:
                confirmed_invoice_map[invoice_key] = max(confirmed_invoice_map[invoice_key], d.financial_impact)
    confirmed_recoverable = sum(confirmed_invoice_map.values())
    
    audit_time = (datetime.now() - start_time).total_seconds()
    
    # Update job metrics
    job.metrics["billing_summary"] = billing_summary
    job.metrics["recoverable_amount"] = round(total_recoverable, 2)
    job.metrics["confirmed_recoverable"] = round(confirmed_recoverable, 2)
    job.metrics["currency"] = rules.currency
    job.metrics["gpt4o_enhanced"] = True
    job.metrics["precision_mode"] = True
    
    job.metrics["date_format_analysis"] = {
        "detected_format": date_format_analysis.detected_format.value,
        "confidence": date_format_analysis.confidence,
        "sample_size": date_format_analysis.sample_size,
        "ambiguous_count": date_format_analysis.ambiguous_count,
        "is_reliable": date_format_analysis.is_reliable(),
    }
    
    job.metrics["discrepancy_summary"] = {
        "confirmed_count": len(confirmed),
        "confirmed_value": round(confirmed_recoverable, 2),
        "needs_review_count": len(needs_review),
        "needs_review_value": round(sum(d.financial_impact for d in needs_review), 2),
        "dismissed_count": len(dismissed),
        "dismissed_value": round(sum(d.financial_impact for d in dismissed), 2),
    }
    
    job.metrics["extraction_quality"] = {
        "confidence": rules.extraction_confidence,
        "needs_review": rules.needs_review,
        "warnings": rules.validation_warnings,
    }
    
    # Step 8: Build pricing timeline for output
    logger.info("[8/8] Building output pricing timeline...")
    
    pricing_periods = []
    if pricing_timeline and pricing_timeline.periods:
        for idx, period in enumerate(pricing_timeline.periods):
            period_start = period.start_date
            period_end = pricing_timeline.periods[idx + 1].start_date if idx < len(pricing_timeline.periods) - 1 else date.today()
            
            # Only include FIXED recurring items in period breakdown
            period_invoices = [
                item for item in invoice_items
                if item.invoice_date and period_start <= item.invoice_date < period_end
                and item.classification in (InvoiceClassification.RECURRING_FIXED, InvoiceClassification.RECURRING)
            ]
            
            period_discrepancies = [
                d for d in all_discrepancies
                if any(
                    item.invoice_date and period_start <= item.invoice_date < period_end
                    for item in d.invoice_items
                )
            ]
            
            # Group by month, deduplicate by SKU
            invoice_breakdown_map = {}
            
            for item in period_invoices:
                if not item.invoice_date:
                    continue
                
                month_key = item.invoice_date.strftime("%b %Y")
                
                if month_key not in invoice_breakdown_map:
                    expected_amount, _ = pricing_timeline.get_expected_amount(item.invoice_date)
                    invoice_breakdown_map[month_key] = {
                        "month": month_key,
                        "invoice_date": item.invoice_date.isoformat(),
                        "expected": round(expected_amount, 2),
                        "billed": 0.0,
                        "skus_seen": set(),
                        "confidence": 0.0,
                        "date_was_ambiguous": item.date_was_ambiguous,
                    }
                
                entry = invoice_breakdown_map[month_key]
                
                # Deduplicate by SKU
                if item.sku and item.sku in entry["skus_seen"]:
                    continue
                if item.sku:
                    entry["skus_seen"].add(item.sku)
                
                billed_amount = item.rate if item.rate > 0 else item.amount
                entry["billed"] = round(entry["billed"] + billed_amount, 2)
                entry["confidence"] = max(entry["confidence"], round(item.effective_confidence(), 3))
            
            # Finalize breakdown
            invoice_breakdown = []
            for month_key, entry in sorted(invoice_breakdown_map.items(), key=lambda x: x[1]["invoice_date"]):
                entry["difference"] = round(entry["expected"] - entry["billed"], 2)
                entry["has_discrepancy"] = abs(entry["difference"]) > 2.0
                del entry["skus_seen"]  # Remove internal tracking
                invoice_breakdown.append(entry)
            
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
        "extraction_confidence": rules.extraction_confidence,
        "validation_warnings": rules.validation_warnings,
        "storage_overage_rate": rules.storage_overage_rate,
        "compute_overage_rate": rules.compute_overage_rate,
    }
    
    job.metrics["audit_time_seconds"] = audit_time
    job.metrics["classification_stats"] = {
        "total_items": len(invoice_items),
        "recurring_fixed": sum(1 for item in invoice_items if item.classification == InvoiceClassification.RECURRING_FIXED),
        "recurring_variable": sum(1 for item in invoice_items if item.classification == InvoiceClassification.RECURRING_VARIABLE),
        "recurring": sum(1 for item in invoice_items if item.classification == InvoiceClassification.RECURRING),
        "one_time": sum(1 for item in invoice_items if item.classification == InvoiceClassification.ONE_TIME),
        "credits": sum(1 for item in invoice_items if item.classification == InvoiceClassification.CREDIT),
        "adjustments": sum(1 for item in invoice_items if item.classification == InvoiceClassification.ADJUSTMENT),
        "ambiguous_dates": sum(1 for item in invoice_items if item.date_was_ambiguous),
    }
    
    # Convert discrepancies to API format
    job.discrepancies = [d.to_dict() for d in all_discrepancies]
    
    await rag_store.index_billing(job, job.discrepancies)

    # Log summary
    logger.info("="*70)
    logger.info(f"RECONCILIATION COMPLETE (PRECISION MODE v2)")
    logger.info(f"  Time: {audit_time:.2f}s")
    logger.info(f"  Duplicate charges found: {len(duplicate_discrepancies)}")
    logger.info(f"  Overage issues found: {len(overage_discrepancies)}")
    logger.info(f"  Confirmed discrepancies: {len(confirmed)} (₹{confirmed_recoverable:,.2f})")
    logger.info(f"  Needs review: {len(needs_review)}")
    logger.info(f"  Dismissed (false positives): {len(dismissed)}")
    logger.info(f"  Total recoverable: ₹{total_recoverable:,.2f} {rules.currency}")
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