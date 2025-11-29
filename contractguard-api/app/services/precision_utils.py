"""
Precision Utilities for Contract Audit System
Provides date format detection, tolerance checking, and validation helpers
to minimize false positives in billing reconciliation.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ============================================================================
# ENUMS
# ============================================================================

class DateFormat(Enum):
    """Detected date format in billing data."""
    DMY = "day_month_year"      # DD/MM/YYYY (European, Indian)
    MDY = "month_day_year"      # MM/DD/YYYY (US)
    YMD = "year_month_day"      # YYYY/MM/DD (ISO)
    AMBIGUOUS = "ambiguous"     # Cannot determine
    MIXED = "mixed"             # Multiple formats detected


class FindingStatus(Enum):
    """Status classification for findings."""
    CONFIRMED_DISCREPANCY = "confirmed"      # High confidence, surface to client
    NEEDS_REVIEW = "needs_review"            # Medium confidence, flag for human
    LIKELY_FALSE_POSITIVE = "dismissed"      # Low confidence, filtered out
    INSUFFICIENT_DATA = "insufficient"       # Can't determine, need more info


# ============================================================================
# DATE FORMAT DETECTION
# ============================================================================

@dataclass
class DateFormatAnalysis:
    """Results of date format analysis."""
    detected_format: DateFormat
    confidence: float
    sample_size: int
    ambiguous_count: int
    evidence: List[str] = field(default_factory=list)
    
    def is_reliable(self) -> bool:
        """Check if detection is reliable enough to use."""
        return (
            self.detected_format not in (DateFormat.AMBIGUOUS, DateFormat.MIXED) and
            self.confidence >= 0.8 and
            self.sample_size >= 5
        )


def detect_date_format(
    rows: List[Dict[str, Any]],
    date_fields: List[str],
    sample_size: int = 50
) -> DateFormatAnalysis:
    """
    Analyze multiple dates to infer the format used in billing data.
    
    Strategy:
    - If any date has day > 12, we know the format unambiguously
    - If any date has month > 12, it must be in the day position
    - Analyze patterns across multiple rows for confidence
    
    Args:
        rows: List of billing row dictionaries
        date_fields: List of possible date field names to check
        sample_size: Number of rows to sample
        
    Returns:
        DateFormatAnalysis with detected format and confidence
    """
    dmy_evidence = []
    mdy_evidence = []
    ymd_evidence = []
    ambiguous_count = 0
    total_parsed = 0
    
    for row in rows[:sample_size]:
        date_value = None
        for field in date_fields:
            if field in row and row[field]:
                date_value = row[field]
                break
        
        if not date_value:
            continue
        
        # Skip if already a date object
        if isinstance(date_value, (date, datetime)):
            continue
        
        text = str(date_value).strip()
        if not text:
            continue
        
        # Normalize separators
        normalized = text.replace("-", "/").replace(".", "/")
        parts = normalized.split("/")
        
        if len(parts) != 3:
            continue
        
        try:
            # Check for YYYY/MM/DD format first
            if len(parts[0]) == 4 and parts[0].isdigit():
                year_val = int(parts[0])
                if 1900 <= year_val <= 2100:
                    ymd_evidence.append(f"{text} → YYYY/MM/DD (year first)")
                    total_parsed += 1
                    continue
            
            # Check for DD/MM/YYYY or MM/DD/YYYY
            if not all(part.isdigit() for part in parts):
                continue
            
            first, second, third = int(parts[0]), int(parts[1]), int(parts[2])
            
            # Handle 2-digit years
            if third < 100:
                third += 2000 if third < 50 else 1900
            
            total_parsed += 1
            
            # UNAMBIGUOUS CASES
            if first > 12 and second <= 12:
                # First value > 12 means it MUST be day (DMY format)
                dmy_evidence.append(f"{text} → DD/MM/YYYY (day={first} > 12)")
            elif second > 12 and first <= 12:
                # Second value > 12 means it MUST be day (MDY format)
                mdy_evidence.append(f"{text} → MM/DD/YYYY (day={second} > 12)")
            elif first > 12 and second > 12:
                # Both > 12 - invalid date
                logger.warning(f"Invalid date: {text} (both {first} and {second} > 12)")
            else:
                # Both <= 12 - ambiguous
                ambiguous_count += 1
                
        except (ValueError, IndexError):
            continue
    
    # Determine format based on evidence
    if len(ymd_evidence) > 0 and len(dmy_evidence) == 0 and len(mdy_evidence) == 0:
        return DateFormatAnalysis(
            detected_format=DateFormat.YMD,
            confidence=1.0,
            sample_size=total_parsed,
            ambiguous_count=ambiguous_count,
            evidence=ymd_evidence[:5]
        )
    
    if len(dmy_evidence) > 0 and len(mdy_evidence) == 0:
        confidence = len(dmy_evidence) / max(total_parsed, 1)
        return DateFormatAnalysis(
            detected_format=DateFormat.DMY,
            confidence=min(0.95, 0.7 + confidence * 0.3),
            sample_size=total_parsed,
            ambiguous_count=ambiguous_count,
            evidence=dmy_evidence[:5]
        )
    
    if len(mdy_evidence) > 0 and len(dmy_evidence) == 0:
        confidence = len(mdy_evidence) / max(total_parsed, 1)
        return DateFormatAnalysis(
            detected_format=DateFormat.MDY,
            confidence=min(0.95, 0.7 + confidence * 0.3),
            sample_size=total_parsed,
            ambiguous_count=ambiguous_count,
            evidence=mdy_evidence[:5]
        )
    
    if len(dmy_evidence) > 0 and len(mdy_evidence) > 0:
        # Mixed formats detected - this is problematic
        return DateFormatAnalysis(
            detected_format=DateFormat.MIXED,
            confidence=0.3,
            sample_size=total_parsed,
            ambiguous_count=ambiguous_count,
            evidence=dmy_evidence[:2] + mdy_evidence[:2]
        )
    
    # All dates were ambiguous
    return DateFormatAnalysis(
        detected_format=DateFormat.AMBIGUOUS,
        confidence=0.5,
        sample_size=total_parsed,
        ambiguous_count=ambiguous_count,
        evidence=[f"All {ambiguous_count} dates have day and month both <= 12"]
    )


def parse_date_with_format(
    value: Any,
    detected_format: DateFormat,
    fallback_format: DateFormat = DateFormat.DMY
) -> Tuple[Optional[date], float]:
    """
    Parse a date value using the detected format.
    
    Args:
        value: The date value to parse
        detected_format: The format detected for this dataset
        fallback_format: Format to use if detected_format is ambiguous
        
    Returns:
        Tuple of (parsed_date, confidence)
        - confidence is reduced if format was ambiguous
    """
    if value in (None, "", "NA", "N/A"):
        return None, 0.0
    
    if isinstance(value, datetime):
        return value.date(), 1.0
    if isinstance(value, date):
        return value, 1.0
    
    text = str(value).strip()
    if not text:
        return None, 0.0
    
    # Handle Excel serial numbers
    if isinstance(value, (int, float)):
        serial = float(value)
        if serial > 59:
            try:
                excel_epoch = datetime(1899, 12, 30)
                return (excel_epoch + timedelta(days=int(serial))).date(), 0.95
            except (OverflowError, ValueError):
                pass
    
    # Try ISO format first (always unambiguous)
    try:
        return datetime.fromisoformat(text).date(), 1.0
    except ValueError:
        pass
    
    # Normalize separators
    normalized = text.replace(".", "/").replace("-", "/")
    parts = normalized.split("/")
    
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        first, second, third = int(parts[0]), int(parts[1]), int(parts[2])
        
        # Handle 2-digit years
        if third < 100:
            third += 2000 if third < 50 else 1900
        
        # Determine day/month based on format
        use_format = detected_format if detected_format not in (DateFormat.AMBIGUOUS, DateFormat.MIXED) else fallback_format
        
        try:
            if use_format == DateFormat.YMD:
                # YYYY/MM/DD
                parsed = date(first if first > 100 else third, second, third if first > 100 else first)
                confidence = 1.0 if detected_format == DateFormat.YMD else 0.6
            elif use_format == DateFormat.DMY:
                # DD/MM/YYYY
                day, month, year = first, second, third
                parsed = date(year, month, day)
                # High confidence if we have evidence, lower if ambiguous
                if first > 12:
                    confidence = 1.0  # Unambiguous
                elif detected_format == DateFormat.DMY:
                    confidence = 0.9  # Format was detected
                else:
                    confidence = 0.6  # Guessing
            else:  # MDY
                # MM/DD/YYYY
                month, day, year = first, second, third
                parsed = date(year, month, day)
                if second > 12:
                    confidence = 1.0  # Unambiguous
                elif detected_format == DateFormat.MDY:
                    confidence = 0.9
                else:
                    confidence = 0.6
            
            return parsed, confidence
            
        except ValueError:
            pass
    
    # Try named month formats
    named_formats = [
        ("%B %d, %Y", 1.0),   # February 1, 2025
        ("%b %d, %Y", 1.0),   # Feb 1, 2025
        ("%d %B %Y", 1.0),    # 1 February 2025
        ("%d %b %Y", 1.0),    # 1 Feb 2025
        ("%d-%b-%Y", 1.0),    # 1-Feb-2025
        ("%d-%B-%Y", 1.0),    # 1-February-2025
    ]
    
    # Remove ordinal suffixes
    clean_text = text
    for suffix in ("st", "nd", "rd", "th"):
        clean_text = clean_text.replace(f"{suffix},", ",").replace(f"{suffix} ", " ")
    
    for fmt, conf in named_formats:
        try:
            return datetime.strptime(clean_text, fmt).date(), conf
        except ValueError:
            continue
    
    logger.warning(f"Could not parse date: '{value}'")
    return None, 0.0


# ============================================================================
# TOLERANCE CHECKING
# ============================================================================

@dataclass
class ToleranceConfig:
    """Configuration for amount tolerance checking."""
    absolute_tolerance: float = 5.0       # Fixed amount tolerance (e.g., ₹5)
    percentage_tolerance: float = 0.001   # Percentage tolerance (0.1%)
    rounding_tolerance: float = 1.0       # For obvious rounding (₹1)
    
    # Thresholds for different confidence levels
    exact_match_threshold: float = 0.01   # Less than 1 paisa difference
    near_match_threshold: float = 0.005   # Within 0.5%


@dataclass
class ToleranceResult:
    """Result of tolerance check."""
    is_within_tolerance: bool
    difference: float
    percentage_difference: float
    confidence: float
    reason: str


def check_amount_tolerance(
    expected: float,
    actual: float,
    config: Optional[ToleranceConfig] = None
) -> ToleranceResult:
    """
    Check if the difference between expected and actual amounts
    is within acceptable tolerance (likely rounding/noise).
    
    Args:
        expected: The expected amount from contract
        actual: The actual billed amount
        config: Tolerance configuration (uses defaults if None)
        
    Returns:
        ToleranceResult with detailed analysis
    """
    if config is None:
        config = ToleranceConfig()
    
    diff = expected - actual
    abs_diff = abs(diff)
    
    # Handle zero/negative expected amounts
    if expected <= 0:
        return ToleranceResult(
            is_within_tolerance=False,
            difference=diff,
            percentage_difference=0.0,
            confidence=0.5,
            reason="Expected amount is zero or negative"
        )
    
    pct_diff = abs_diff / expected
    
    # Exact match
    if abs_diff < config.exact_match_threshold:
        return ToleranceResult(
            is_within_tolerance=True,
            difference=diff,
            percentage_difference=pct_diff,
            confidence=1.0,
            reason="Exact match"
        )
    
    # Within rounding tolerance
    if abs_diff <= config.rounding_tolerance:
        return ToleranceResult(
            is_within_tolerance=True,
            difference=diff,
            percentage_difference=pct_diff,
            confidence=0.98,
            reason=f"Within rounding tolerance (₹{config.rounding_tolerance})"
        )
    
    # Within absolute tolerance
    if abs_diff <= config.absolute_tolerance:
        return ToleranceResult(
            is_within_tolerance=True,
            difference=diff,
            percentage_difference=pct_diff,
            confidence=0.95,
            reason=f"Within absolute tolerance (₹{config.absolute_tolerance})"
        )
    
    # Within percentage tolerance
    if pct_diff <= config.percentage_tolerance:
        return ToleranceResult(
            is_within_tolerance=True,
            difference=diff,
            percentage_difference=pct_diff,
            confidence=0.90,
            reason=f"Within percentage tolerance ({config.percentage_tolerance*100}%)"
        )
    
    # Outside all tolerances - this is a real difference
    return ToleranceResult(
        is_within_tolerance=False,
        difference=diff,
        percentage_difference=pct_diff,
        confidence=0.0,  # Confidence that it's within tolerance
        reason=f"Outside tolerance: ₹{abs_diff:.2f} ({pct_diff*100:.2f}%)"
    )


# ============================================================================
# CONTRACT TERM VALIDATION
# ============================================================================

@dataclass
class TermValidationResult:
    """Result of contract term validation."""
    is_valid: bool
    warnings: List[str]
    adjusted_terms: Dict[str, Any]
    needs_review: bool


def validate_extracted_terms(
    terms: Dict[str, Any],
    filename: str
) -> TermValidationResult:
    """
    Validate extracted contract terms are within reasonable bounds.
    
    Args:
        terms: The extracted terms dictionary from GPT-4o
        filename: Source filename for logging
        
    Returns:
        TermValidationResult with validation status and any adjustments
    """
    warnings = []
    adjusted_terms = terms.copy()
    needs_review = False
    
    base_pricing = adjusted_terms.get("base_pricing", {})
    escalation = adjusted_terms.get("escalation", {})
    confidence = adjusted_terms.get("extraction_confidence", {})
    
    # === Validate base amount ===
    amount = base_pricing.get("amount")
    if amount is not None:
        if amount <= 0:
            warnings.append(f"Invalid base amount: {amount} (must be positive)")
            base_pricing["amount"] = None
            needs_review = True
        elif amount > 100_000_000:  # ₹10 crore
            warnings.append(f"Unusually large base amount: ₹{amount:,.0f} - verify manually")
            base_pricing["_needs_review"] = True
            needs_review = True
        elif amount < 100:  # Less than ₹100
            warnings.append(f"Unusually small base amount: ₹{amount:,.0f} - verify manually")
            base_pricing["_needs_review"] = True
            needs_review = True
    
    # === Validate escalation rate ===
    rate = escalation.get("rate")
    if rate is not None:
        if rate < 0:
            warnings.append(f"Negative escalation rate: {rate*100}% - invalid")
            escalation["rate"] = None
            needs_review = True
        elif rate > 0.25:  # >25% annual escalation
            warnings.append(f"Very high escalation rate: {rate*100}% - verify manually")
            escalation["_needs_review"] = True
            needs_review = True
        elif rate > 0 and rate < 0.01:  # <1% might be a decimal error
            warnings.append(f"Very low escalation rate: {rate*100}% - might be extraction error")
            escalation["_needs_review"] = True
    
    # === Cross-validate dates ===
    start_date = base_pricing.get("start_date")
    effective_date = escalation.get("effective_date")
    
    if start_date and effective_date:
        try:
            start = datetime.fromisoformat(str(start_date)).date() if isinstance(start_date, str) else start_date
            effective = datetime.fromisoformat(str(effective_date)).date() if isinstance(effective_date, str) else effective_date
            
            if effective < start:
                warnings.append(f"Escalation date ({effective}) is before contract start ({start})")
                escalation["effective_date"] = None
                needs_review = True
            
            # Check if escalation is too far in future
            if effective > date.today() + timedelta(days=365*5):
                warnings.append(f"Escalation date ({effective}) is >5 years in future - verify")
                escalation["_needs_review"] = True
                needs_review = True
                
        except (ValueError, TypeError) as e:
            warnings.append(f"Date parsing error: {e}")
            needs_review = True
    
    # === Validate extraction confidence ===
    overall_confidence = confidence.get("overall", 0)
    if overall_confidence < 0.5:
        warnings.append(f"Low extraction confidence: {overall_confidence:.0%}")
        adjusted_terms["_low_confidence"] = True
        needs_review = True
    elif overall_confidence < 0.7:
        warnings.append(f"Moderate extraction confidence: {overall_confidence:.0%} - review recommended")
        needs_review = True
    
    # Update nested dicts
    adjusted_terms["base_pricing"] = base_pricing
    adjusted_terms["escalation"] = escalation
    
    # Log warnings
    if warnings:
        logger.warning(f"Contract term validation for {filename}:")
        for warning in warnings:
            logger.warning(f"  - {warning}")
    
    return TermValidationResult(
        is_valid=len([w for w in warnings if "invalid" in w.lower()]) == 0,
        warnings=warnings,
        adjusted_terms=adjusted_terms,
        needs_review=needs_review
    )


# ============================================================================
# PRO-RATA DETECTION
# ============================================================================

@dataclass
class ProRataAnalysis:
    """Analysis of whether an amount might be pro-rata."""
    is_likely_pro_rata: bool
    detected_percentage: Optional[float]
    confidence: float
    reason: str


def detect_pro_rata(
    actual_amount: float,
    expected_amount: float,
    description: str
) -> ProRataAnalysis:
    """
    Detect if an invoice amount is likely a pro-rata (partial period) charge.
    
    Args:
        actual_amount: The actual billed amount
        expected_amount: The expected full amount
        description: Invoice line description
        
    Returns:
        ProRataAnalysis with detection results
    """
    if expected_amount <= 0:
        return ProRataAnalysis(
            is_likely_pro_rata=False,
            detected_percentage=None,
            confidence=0.0,
            reason="Invalid expected amount"
        )
    
    ratio = actual_amount / expected_amount
    
    # Check description for pro-rata keywords
    desc_lower = description.lower()
    pro_rata_keywords = [
        "pro-rata", "pro rata", "prorata", "partial", "days",
        "partial month", "partial period", "prorated", "adjusted"
    ]
    has_keyword = any(kw in desc_lower for kw in pro_rata_keywords)
    
    # Common partial percentages (with some tolerance)
    common_partials = {
        0.25: "quarter month (~7-8 days)",
        0.33: "one-third month (~10 days)",
        0.50: "half month (~15 days)",
        0.66: "two-thirds month (~20 days)",
        0.75: "three-quarter month (~22-23 days)",
    }
    
    # Check for common partial percentages
    for partial, description_hint in common_partials.items():
        if abs(ratio - partial) < 0.05:  # Within 5% of common partial
            confidence = 0.9 if has_keyword else 0.7
            return ProRataAnalysis(
                is_likely_pro_rata=True,
                detected_percentage=ratio,
                confidence=confidence,
                reason=f"Amount is ~{partial*100:.0f}% of expected ({description_hint})"
            )
    
    # Check for day-based pro-rata (any ratio between 0.03 and 0.97)
    if 0.03 <= ratio <= 0.97:
        # Estimate days
        estimated_days = round(ratio * 30)
        
        if has_keyword:
            return ProRataAnalysis(
                is_likely_pro_rata=True,
                detected_percentage=ratio,
                confidence=0.85,
                reason=f"Pro-rata keyword found, ~{estimated_days} days ({ratio*100:.1f}%)"
            )
        
        # Without keyword, only flag if it's a "clean" ratio
        if ratio * 30 % 1 < 0.1:  # Close to whole number of days
            return ProRataAnalysis(
                is_likely_pro_rata=True,
                detected_percentage=ratio,
                confidence=0.6,
                reason=f"Possible pro-rata for {estimated_days} days ({ratio*100:.1f}%)"
            )
    
    return ProRataAnalysis(
        is_likely_pro_rata=False,
        detected_percentage=ratio if 0 < ratio < 1 else None,
        confidence=0.0,
        reason="Does not match pro-rata patterns"
    )


# ============================================================================
# FINDING CLASSIFICATION
# ============================================================================

def classify_finding(
    confidence: float,
    financial_impact: float,
    has_contract_evidence: bool,
    validation_passed: bool
) -> FindingStatus:
    """
    Classify a finding into the appropriate status category.
    
    Args:
        confidence: Overall confidence score (0-1)
        financial_impact: Financial impact in currency
        has_contract_evidence: Whether we have supporting contract clauses
        validation_passed: Whether GPT-4o validation confirmed it
        
    Returns:
        FindingStatus classification
    """
    # High confidence confirmed discrepancy
    if confidence >= 0.85 and validation_passed and has_contract_evidence:
        return FindingStatus.CONFIRMED_DISCREPANCY
    
    # Good confidence but missing some elements
    if confidence >= 0.75 and (validation_passed or has_contract_evidence):
        if financial_impact > 1000:  # Significant impact
            return FindingStatus.CONFIRMED_DISCREPANCY
        return FindingStatus.NEEDS_REVIEW
    
    # Medium confidence - needs review
    if confidence >= 0.60:
        return FindingStatus.NEEDS_REVIEW
    
    # Low confidence - likely false positive
    if confidence >= 0.40:
        return FindingStatus.LIKELY_FALSE_POSITIVE
    
    # Very low confidence - insufficient data
    return FindingStatus.INSUFFICIENT_DATA


# ============================================================================
# CONFIDENCE THRESHOLDS
# ============================================================================

# Minimum confidence to surface a finding to the client
MINIMUM_CONFIDENCE_TO_SURFACE = 0.75

# Minimum confidence to mark as "confirmed" (vs "needs review")
MINIMUM_CONFIDENCE_FOR_CONFIRMED = 0.85

# Confidence reduction factors
CONFIDENCE_REDUCTION_AMBIGUOUS_DATE = 0.7
CONFIDENCE_REDUCTION_LOW_EXTRACTION = 0.8
CONFIDENCE_REDUCTION_NO_CONTRACT_EVIDENCE = 0.9