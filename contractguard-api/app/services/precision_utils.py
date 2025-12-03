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
    sample_size: int = 100
) -> DateFormatAnalysis:
    """
    Analyze multiple dates to infer the format used in billing data.
    
    Enhanced Strategy:
    1. Unambiguous cases: day > 12 or month > 12
    2. Temporal consistency: dates should be in chronological order
    3. Statistical analysis: try both formats and see which produces more valid dates
    4. Pattern frequency: count which format appears more often
    5. Context clues: check for locale indicators
    
    Args:
        rows: List of billing row dictionaries
        date_fields: List of possible date field names to check
        sample_size: Number of rows to sample (increased for better accuracy)
        
    Returns:
        DateFormatAnalysis with detected format and confidence
    """
    dmy_evidence = []
    mdy_evidence = []
    ymd_evidence = []
    ambiguous_dates = []  # Store ambiguous dates for further analysis
    total_parsed = 0
    
    # Collect all date values first
    date_values = []
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
            date_values.append(("parsed", date_value.date() if isinstance(date_value, datetime) else date_value))
            continue
        
        text = str(date_value).strip()
        if not text:
            continue
        
        date_values.append(("text", text))
    
    # Analyze each date value
    for date_type, date_value in date_values:
        if date_type == "parsed":
            # Already parsed - use it directly
            parsed_date = date_value
            ymd_evidence.append(f"{parsed_date} → Already parsed")
            total_parsed += 1
            continue
        
        text = date_value
        # Normalize separators
        normalized = text.replace("-", "/").replace(".", "/")
        parts = normalized.split("/")
        
        if len(parts) != 3:
            continue
        
        try:
            # Check for YYYY/MM/DD format first (always unambiguous)
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
                # Both <= 12 - ambiguous, store for further analysis
                ambiguous_dates.append((text, first, second, third))
                
        except (ValueError, IndexError):
            continue
    
    # Handle unambiguous cases first
    if len(ymd_evidence) > 0 and len(dmy_evidence) == 0 and len(mdy_evidence) == 0:
        return DateFormatAnalysis(
            detected_format=DateFormat.YMD,
            confidence=1.0,
            sample_size=total_parsed,
            ambiguous_count=len(ambiguous_dates),
            evidence=ymd_evidence[:5]
        )
    
    if len(dmy_evidence) > 0 and len(mdy_evidence) == 0:
        # Use ambiguous dates to boost confidence
        confidence = _analyze_ambiguous_dates(ambiguous_dates, DateFormat.DMY, dmy_evidence)
        return DateFormatAnalysis(
            detected_format=DateFormat.DMY,
            confidence=confidence,
            sample_size=total_parsed,
            ambiguous_count=len(ambiguous_dates),
            evidence=dmy_evidence[:5]
        )
    
    if len(mdy_evidence) > 0 and len(dmy_evidence) == 0:
        # Use ambiguous dates to boost confidence
        confidence = _analyze_ambiguous_dates(ambiguous_dates, DateFormat.MDY, mdy_evidence)
        return DateFormatAnalysis(
            detected_format=DateFormat.MDY,
            confidence=confidence,
            sample_size=total_parsed,
            ambiguous_count=len(ambiguous_dates),
            evidence=mdy_evidence[:5]
        )
    
    if len(dmy_evidence) > 0 and len(mdy_evidence) > 0:
        # Mixed formats detected - this is problematic
        return DateFormatAnalysis(
            detected_format=DateFormat.MIXED,
            confidence=0.3,
            sample_size=total_parsed,
            ambiguous_count=len(ambiguous_dates),
            evidence=dmy_evidence[:2] + mdy_evidence[:2]
        )
    
    # All dates were ambiguous - use temporal consistency and statistical analysis
    if len(ambiguous_dates) > 0:
        return _resolve_ambiguous_dates(ambiguous_dates, total_parsed)
    
    # No dates found
    return DateFormatAnalysis(
        detected_format=DateFormat.AMBIGUOUS,
        confidence=0.0,
        sample_size=0,
        ambiguous_count=0,
        evidence=["No date values found in sample"]
    )


def _analyze_ambiguous_dates(
    ambiguous_dates: List[Tuple[str, int, int, int]],
    detected_format: DateFormat,
    unambiguous_evidence: List[str]
) -> float:
    """
    Analyze ambiguous dates to boost confidence in detected format.
    
    Uses temporal consistency: dates should generally be in chronological order.
    """
    if len(ambiguous_dates) == 0:
        # No ambiguous dates - high confidence
        base_confidence = len(unambiguous_evidence) / max(len(unambiguous_evidence), 1)
        return min(0.95, 0.7 + base_confidence * 0.3)
    
    # Try parsing ambiguous dates with detected format
    valid_dates_dmy = []
    valid_dates_mdy = []
    
    for text, first, second, third in ambiguous_dates:
        # Try DMY format
        try:
            dmy_date = date(third, second, first)
            if 1 <= first <= 31 and 1 <= second <= 12:
                valid_dates_dmy.append(dmy_date)
        except ValueError:
            pass
        
        # Try MDY format
        try:
            mdy_date = date(third, first, second)
            if 1 <= first <= 12 and 1 <= second <= 31:
                valid_dates_mdy.append(mdy_date)
        except ValueError:
            pass
    
    # Check temporal consistency
    dmy_consistent = _check_temporal_consistency(valid_dates_dmy)
    mdy_consistent = _check_temporal_consistency(valid_dates_mdy)
    
    if detected_format == DateFormat.DMY:
        if dmy_consistent and len(valid_dates_dmy) > len(valid_dates_mdy):
            # Strong evidence for DMY
            return 0.92
        elif dmy_consistent:
            return 0.85
        else:
            return 0.75
    
    else:  # MDY
        if mdy_consistent and len(valid_dates_mdy) > len(valid_dates_dmy):
            # Strong evidence for MDY
            return 0.92
        elif mdy_consistent:
            return 0.85
        else:
            return 0.75


def _check_temporal_consistency(dates: List[date]) -> bool:
    """
    Check if dates are in reasonable chronological order.
    
    Returns True if dates are mostly in order (allowing for some out-of-order invoices).
    """
    if len(dates) < 3:
        return True  # Not enough data to check
    
    sorted_dates = sorted(dates)
    # Count how many dates are in correct position
    in_order = sum(1 for i, d in enumerate(dates) if abs((d - sorted_dates[i]).days) < 90)
    
    # At least 70% should be in reasonable order
    return (in_order / len(dates)) >= 0.7


def _resolve_ambiguous_dates(
    ambiguous_dates: List[Tuple[str, int, int, int]],
    total_parsed: int
) -> DateFormatAnalysis:
    """
    Resolve ambiguous dates using statistical analysis and temporal consistency.
    
    Strategy:
    1. Try both DMY and MDY formats
    2. Count valid dates for each format
    3. Check temporal consistency
    4. Use the format with more valid dates and better consistency
    """
    valid_dates_dmy = []
    valid_dates_mdy = []
    invalid_both = 0
    
    for text, first, second, third in ambiguous_dates:
        valid_dmy = False
        valid_mdy = False
        
        # Try DMY format (DD/MM/YYYY)
        try:
            dmy_date = date(third, second, first)
            if 1 <= first <= 31 and 1 <= second <= 12:
                valid_dates_dmy.append((text, dmy_date))
                valid_dmy = True
        except ValueError:
            pass
        
        # Try MDY format (MM/DD/YYYY)
        try:
            mdy_date = date(third, first, second)
            if 1 <= first <= 12 and 1 <= second <= 31:
                valid_dates_mdy.append((text, mdy_date))
                valid_mdy = True
        except ValueError:
            pass
        
        if not valid_dmy and not valid_mdy:
            invalid_both += 1
    
    # Score each format
    dmy_score = len(valid_dates_dmy)
    mdy_score = len(valid_dates_mdy)
    
    # Check temporal consistency
    dmy_dates_only = [d for _, d in valid_dates_dmy]
    mdy_dates_only = [d for _, d in valid_dates_mdy]
    
    dmy_consistent = _check_temporal_consistency(dmy_dates_only)
    mdy_consistent = _check_temporal_consistency(mdy_dates_only)
    
    # Boost score for temporal consistency
    if dmy_consistent:
        dmy_score *= 1.3
    if mdy_consistent:
        mdy_score *= 1.3
    
    # Determine winner
    if dmy_score > mdy_score * 1.2:  # Clear winner
        evidence = [f"{text} → DD/MM/YYYY" for text, _ in valid_dates_dmy[:5]]
        return DateFormatAnalysis(
            detected_format=DateFormat.DMY,
            confidence=0.85 if dmy_consistent else 0.75,
            sample_size=total_parsed,
            ambiguous_count=len(ambiguous_dates),
            evidence=evidence
        )
    elif mdy_score > dmy_score * 1.2:  # Clear winner
        evidence = [f"{text} → MM/DD/YYYY" for text, _ in valid_dates_mdy[:5]]
        return DateFormatAnalysis(
            detected_format=DateFormat.MDY,
            confidence=0.85 if mdy_consistent else 0.75,
            sample_size=total_parsed,
            ambiguous_count=len(ambiguous_dates),
            evidence=evidence
        )
    else:
        # Too close to call - default to DMY (more common internationally) but lower confidence
        logger.warning(f"Ambiguous date format: DMY score={dmy_score:.1f}, MDY score={mdy_score:.1f} - defaulting to DMY")
        evidence = [f"{text} → DD/MM/YYYY (default)" for text, _ in valid_dates_dmy[:5]]
        return DateFormatAnalysis(
            detected_format=DateFormat.DMY,
            confidence=0.65,  # Lower confidence when ambiguous
            sample_size=total_parsed,
            ambiguous_count=len(ambiguous_dates),
            evidence=evidence
        )


def parse_date_with_format(
    value: Any,
    detected_format: DateFormat,
    fallback_format: DateFormat = DateFormat.DMY
) -> Tuple[Optional[date], float]:
    """
    Parse a date value using the detected format with enhanced reliability.
    
    Args:
        value: The date value to parse
        detected_format: The format detected for this dataset
        fallback_format: Format to use if detected_format is ambiguous
        
    Returns:
        Tuple of (parsed_date, confidence)
        - confidence is reduced if format was ambiguous
    """
    if value in (None, "", "NA", "N/A", "null", "NULL"):
        return None, 0.0
    
    if isinstance(value, datetime):
        return value.date(), 1.0
    if isinstance(value, date):
        return value, 1.0
    
    text = str(value).strip()
    if not text:
        return None, 0.0
    
    # Handle Excel serial numbers (common in CSV exports)
    if isinstance(value, (int, float)):
        serial = float(value)
        if 1 <= serial <= 100000:  # Reasonable Excel date range
            try:
                excel_epoch = datetime(1899, 12, 30)
                parsed_date = (excel_epoch + timedelta(days=int(serial))).date()
                # Validate the date is reasonable
                if 1900 <= parsed_date.year <= 2100:
                    return parsed_date, 0.95
            except (OverflowError, ValueError):
                pass
    
    # Try ISO format first (always unambiguous)
    for iso_format in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"]:
        try:
            return datetime.strptime(text, iso_format).date(), 1.0
        except ValueError:
            continue
    
    # Try datetime.fromisoformat for extended ISO formats
    try:
        # Handle timezone-aware and timezone-naive ISO formats
        if "T" in text:
            # ISO datetime format
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            return dt.date(), 1.0
        else:
            # ISO date format
            return datetime.fromisoformat(text).date(), 1.0
    except ValueError:
        pass
    
    # Normalize separators and whitespace
    normalized = text.replace(".", "/").replace("-", "/").replace(" ", "/")
    # Remove multiple consecutive slashes
    normalized = re.sub(r"/+", "/", normalized).strip("/")
    parts = [p.strip() for p in normalized.split("/") if p.strip()]
    
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        first, second, third = int(parts[0]), int(parts[1]), int(parts[2])
        
        # Handle 2-digit years intelligently
        if third < 100:
            # Assume years 00-49 are 2000-2049, 50-99 are 1950-1999
            third += 2000 if third < 50 else 1900
        elif third < 1900:
            # Very old dates - likely a parsing error
            return None, 0.0
        
        # Determine day/month based on format
        use_format = detected_format if detected_format not in (DateFormat.AMBIGUOUS, DateFormat.MIXED) else fallback_format
        
        # Try both formats if ambiguous to find which produces valid date
        formats_to_try = []
        if use_format == DateFormat.YMD:
            formats_to_try.append(("YMD", first, second, third))
        elif use_format == DateFormat.DMY:
            formats_to_try.append(("DMY", first, second, third))
            # If ambiguous, also try MDY as fallback
            if detected_format in (DateFormat.AMBIGUOUS, DateFormat.MIXED) and first <= 12:
                formats_to_try.append(("MDY", first, second, third))
        else:  # MDY
            formats_to_try.append(("MDY", first, second, third))
            # If ambiguous, also try DMY as fallback
            if detected_format in (DateFormat.AMBIGUOUS, DateFormat.MIXED) and second <= 12:
                formats_to_try.append(("DMY", first, second, third))
        
        for fmt_name, a, b, c in formats_to_try:
            try:
                if fmt_name == "YMD":
                    # YYYY/MM/DD
                    parsed = date(a, b, c)
                    confidence = 1.0 if detected_format == DateFormat.YMD else 0.6
                elif fmt_name == "DMY":
                    # DD/MM/YYYY
                    day, month, year = a, b, c
                    # Validate day and month ranges
                    if not (1 <= day <= 31 and 1 <= month <= 12):
                        continue
                    parsed = date(year, month, day)
                    # High confidence if unambiguous or format was detected
                    if a > 12:
                        confidence = 1.0  # Unambiguous (day > 12)
                    elif detected_format == DateFormat.DMY:
                        confidence = 0.9  # Format was detected
                    else:
                        confidence = 0.7  # Using fallback
                else:  # MDY
                    # MM/DD/YYYY
                    month, day, year = a, b, c
                    # Validate day and month ranges
                    if not (1 <= month <= 12 and 1 <= day <= 31):
                        continue
                    parsed = date(year, month, day)
                    if b > 12:
                        confidence = 1.0  # Unambiguous (day > 12)
                    elif detected_format == DateFormat.MDY:
                        confidence = 0.9  # Format was detected
                    else:
                        confidence = 0.7  # Using fallback
                
                # Additional validation: check if date is reasonable
                if 1900 <= parsed.year <= 2100:
                    return parsed, confidence
                    
            except ValueError:
                continue
    
    # Try named month formats (more reliable)
    named_formats = [
        ("%B %d, %Y", 1.0),      # February 1, 2025
        ("%b %d, %Y", 1.0),      # Feb 1, 2025
        ("%d %B %Y", 1.0),       # 1 February 2025
        ("%d %b %Y", 1.0),       # 1 Feb 2025
        ("%d-%b-%Y", 1.0),       # 1-Feb-2025
        ("%d-%B-%Y", 1.0),       # 1-February-2025
        ("%B %d %Y", 1.0),       # February 1 2025
        ("%b %d %Y", 1.0),       # Feb 1 2025
        ("%d/%b/%Y", 1.0),       # 1/Feb/2025
        ("%d/%B/%Y", 1.0),       # 1/February/2025
    ]
    
    # Remove ordinal suffixes
    clean_text = text
    for suffix in ("st", "nd", "rd", "th"):
        clean_text = re.sub(rf"\b(\d+){suffix}\b", r"\1", clean_text, flags=re.IGNORECASE)
        clean_text = clean_text.replace(f"{suffix},", ",").replace(f"{suffix} ", " ")
    
    for fmt, conf in named_formats:
        try:
            parsed = datetime.strptime(clean_text, fmt).date()
            if 1900 <= parsed.year <= 2100:
                return parsed, conf
        except ValueError:
            continue
    
    # Last resort: try common date patterns with regex
    date_patterns = [
        (r"(\d{4})(\d{2})(\d{2})", "YMD"),  # YYYYMMDD
        (r"(\d{2})(\d{2})(\d{4})", "MDY"),  # MMDDYYYY
        (r"(\d{2})(\d{2})(\d{4})", "DMY"),  # DDMMYYYY
    ]
    
    for pattern, fmt_name in date_patterns:
        match = re.match(pattern, text.replace("/", "").replace("-", "").replace(".", ""))
        if match:
            try:
                a, b, c = int(match.group(1)), int(match.group(2)), int(match.group(3))
                if fmt_name == "YMD" and 1900 <= a <= 2100:
                    parsed = date(a, b, c)
                    if 1 <= b <= 12 and 1 <= c <= 31:
                        return parsed, 0.8
            except (ValueError, IndexError):
                continue
    
    # Log warning only for truly unparseable dates
    if len(text) > 2:  # Ignore very short strings
        logger.debug(f"Could not parse date: '{value}' (format: {detected_format.value})")
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