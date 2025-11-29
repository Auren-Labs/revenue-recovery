"""
Unified Pricing Timeline Model
Handles ALL pricing scenarios with a single, predictable data structure.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


@dataclass
class PricingPeriod:
    """A single pricing period with a start date and amount."""
    start_date: date
    amount: float
    source: str  # Which document this came from
    reason: str  # Why this price is set
    
    def __repr__(self):
        return f"PricingPeriod({self.start_date}: ₹{self.amount:,.0f} - {self.reason})"


class PricingTimeline:
    """
    A complete pricing timeline for a contract.
    
    This is the SINGLE SOURCE OF TRUTH for expected pricing.
    It handles:
    - Base pricing
    - Escalations
    - Amendments
    - Any combination of the above
    """
    
    def __init__(self):
        self.periods: List[PricingPeriod] = []
        self.escalation_rate: float = 0.0
        self.currency: str = "INR"
    
    def add_period(self, start_date: date, amount: float, source: str, reason: str):
        """Add a pricing period to the timeline."""
        self.periods.append(PricingPeriod(
            start_date=start_date,
            amount=amount,
            source=source,
            reason=reason
        ))
    
    def finalize(self):
        """
        Sort and validate the timeline after all periods are added.
        Call this ONCE after building the timeline.
        """
        # Sort by date
        self.periods.sort(key=lambda p: p.start_date)
        
        # Remove duplicates (keep latest for same date)
        unique_periods = []
        seen_dates = set()
        for period in reversed(self.periods):  # Process in reverse to keep latest
            if period.start_date not in seen_dates:
                unique_periods.insert(0, period)
                seen_dates.add(period.start_date)
        self.periods = unique_periods
        
        # Log the final timeline
        logger.info("="*80)
        logger.info("📅 FINAL PRICING TIMELINE:")
        for idx, period in enumerate(self.periods):
            logger.info(f"   {idx+1}. {period}")
        logger.info("="*80)
    
    def get_expected_amount(self, invoice_date: date) -> Tuple[float, str]:
        """
        Get the expected amount for a given invoice date.
        
        This is THE core function that everything uses.
        Simple logic: Find the most recent period before the invoice date.
        """
        if not self.periods:
            logger.warning("get_expected_amount called but no periods exist!")
            return (0.0, "No pricing information available")
        
        # Find the most recent period that started before or on invoice_date
        applicable_period = None
        for period in self.periods:
            if invoice_date >= period.start_date:
                applicable_period = period
            else:
                break  # Periods are sorted, so we can stop
        
        if applicable_period:
            return (
                applicable_period.amount,
                f"{applicable_period.reason} (from {applicable_period.source})"
            )
        
        # Invoice is before any pricing period (shouldn't happen)
        first_period = self.periods[0]
        logger.warning(f"Invoice date {invoice_date} is before first period {first_period.start_date}")
        return (
            first_period.amount,
            f"Using earliest available rate (from {first_period.source})"
        )


# def build_pricing_timeline(rules: dict) -> PricingTimeline:
#     """
#     Build a complete pricing timeline from extracted rules.
    
#     SIMPLE STRATEGY:
#     1. Always add base period first
#     2. If escalation exists, add escalation period
#     3. If amendments exist, add them (they override)
#     """
#     timeline = PricingTimeline()
    
#     timeline.escalation_rate = rules.get("escalation_rate", 0.0)
#     timeline.currency = rules.get("currency", "INR")
    
#     base_amount = rules.get("base_amount")
#     if not base_amount or base_amount == 0:
#         logger.error("❌ No base amount found in rules!")
#         return timeline
    
#     logger.info("="*80)
#     logger.info("🏗️  BUILDING PRICING TIMELINE")
#     logger.info(f"   Base amount: ₹{base_amount:,.0f}")
#     logger.info(f"   Escalation rate: {rules.get('escalation_rate', 0)*100}%")
#     logger.info(f"   Effective start: {rules.get('effective_start_date', 'N/A')}")
    
#     # 🔥 STEP 1: Always add BASE period
#     base_start = rules.get("base_start_date", "2024-01-01")
#     try:
#         base_date = datetime.fromisoformat(str(base_start)).date()
#     except Exception as e:
#         logger.warning(f"Failed to parse base_start_date '{base_start}': {e}")
#         base_date = date(2024, 1, 1)
    
#     timeline.add_period(
#         start_date=base_date,
#         amount=float(base_amount),
#         source="MSA",
#         reason="Original base pricing"
#     )
#     logger.info(f"   ✅ Base period: {base_date} → ₹{base_amount:,.0f}")
    
#     # 🔥 STEP 2: Add ESCALATION if it exists
#     escalation_rate = rules.get("escalation_rate", 0.0)
#     escalation_start = rules.get("effective_start_date")
    
#     if escalation_start and escalation_rate > 0:
#         try:
#             escalation_date = datetime.fromisoformat(str(escalation_start)).date()
#             escalated_amount = float(base_amount) * (1 + float(escalation_rate))
            
#             timeline.add_period(
#                 start_date=escalation_date,
#                 amount=escalated_amount,
#                 source="MSA",
#                 reason=f"{escalation_rate*100}% annual escalation"
#             )
#             logger.info(f"   ✅ Escalation period: {escalation_date} → ₹{escalated_amount:,.0f}")
#         except Exception as e:
#             logger.error(f"   ❌ Failed to add escalation: {e}")
    
#     # 🔥 STEP 3: Add AMENDMENTS (if they exist and are NOT the base)
#     amendment_history = rules.get("amendment_history", [])
    
#     if amendment_history:
#         logger.info(f"   Processing {len(amendment_history)} amendment history entries...")
        
#         for idx, amendment in enumerate(amendment_history):
#             description = amendment.get("description", "")
            
#             # Skip if this is the original base (we already added it)
#             if "Original base" in description or "original base" in description.lower():
#                 logger.info(f"      [{idx+1}] Skipping base entry: {description}")
#                 continue
            
#             try:
#                 date_str = amendment.get("date")
#                 amount = amendment.get("amount")
#                 source = amendment.get("source", "amendment")
                
#                 if not date_str or not amount:
#                     logger.warning(f"      [{idx+1}] Missing date or amount, skipping")
#                     continue
                
#                 period_date = datetime.fromisoformat(str(date_str)).date()
                
#                 timeline.add_period(
#                     start_date=period_date,
#                     amount=float(amount),
#                     source=source,
#                     reason=description
#                 )
#                 logger.info(f"      [{idx+1}] ✅ Amendment: {period_date} → ₹{amount:,.0f} ({description})")
#             except Exception as e:
#                 logger.error(f"      [{idx+1}] ❌ Failed to parse amendment: {e}")
#                 continue
    
#     # 🔥 FINALIZE: Sort and dedupe
#     timeline.finalize()
    
#     logger.info("="*80)
    
#     return timeline

def build_pricing_timeline(rules: dict) -> PricingTimeline:
    """
    Build a complete pricing timeline from extracted rules.

    SIMPLE STRATEGY:
    1. Always add base period first (using the ORIGINAL base)
    2. If escalation exists, add escalation period
    3. If amendments exist, add them (they override)
    """
    timeline = PricingTimeline()

    timeline.escalation_rate = rules.get("escalation_rate", 0.0)
    timeline.currency = rules.get("currency", "INR")

    # This is the *latest* known amount (after amendments)
    latest_base_amount = rules.get("base_amount")
    if not latest_base_amount or latest_base_amount == 0:
        logger.error("❌ No base amount found in rules!")
        return timeline

    amendment_history = rules.get("amendment_history", [])

    # 🔍 Find the ORIGINAL base in amendment_history, if present
    original_base_entry = None
    for entry in amendment_history:
        desc = (entry.get("description") or "").lower()
        if "original base" in desc:
            original_base_entry = entry
            break

    if original_base_entry and original_base_entry.get("amount"):
        base_amount_for_timeline = float(original_base_entry["amount"])
        base_source = original_base_entry.get("source", "MSA")
    else:
        # Fallback: use latest amount if we don't have a tagged original base
        base_amount_for_timeline = float(latest_base_amount)
        base_source = "MSA"

    logger.info("=" * 80)
    logger.info("🏗️  BUILDING PRICING TIMELINE")
    logger.info(f"   Original/base amount for timeline: ₹{base_amount_for_timeline:,.0f}")
    logger.info(f"   Latest base_amount (for reporting): ₹{float(latest_base_amount):,.0f}")
    logger.info(f"   Escalation rate: {rules.get('escalation_rate', 0) * 100}%")
    logger.info(f"   Effective start: {rules.get('effective_start_date', 'N/A')}")

    # 🔥 STEP 1: Always add BASE period (using original base)
    base_start = rules.get("base_start_date", "2024-01-01")
    try:
        base_date = datetime.fromisoformat(str(base_start)).date()
    except Exception as e:
        logger.warning(f"Failed to parse base_start_date '{base_start}': {e}")
        base_date = date(2024, 1, 1)

    timeline.add_period(
        start_date=base_date,
        amount=base_amount_for_timeline,
        source=base_source,
        reason="Original base pricing",
    )
    logger.info(f"   ✅ Base period: {base_date} → ₹{base_amount_for_timeline:,.0f}")

    # 🔥 STEP 2: Add ESCALATION if it exists (also based on original base)
    escalation_rate = rules.get("escalation_rate", 0.0)
    escalation_start = rules.get("effective_start_date")

    if escalation_start and escalation_rate > 0:
        try:
            escalation_date = datetime.fromisoformat(str(escalation_start)).date()
            escalated_amount = base_amount_for_timeline * (1 + float(escalation_rate))

            timeline.add_period(
                start_date=escalation_date,
                amount=escalated_amount,
                source="MSA",
                reason=f"{escalation_rate * 100}% annual escalation",
            )
            logger.info(
                f"   ✅ Escalation period: {escalation_date} → ₹{escalated_amount:,.0f}"
            )
        except Exception as e:
            logger.error(f"   ❌ Failed to add escalation: {e}")

    # 🔥 STEP 3: Add AMENDMENTS (skip the original-base entry; they override)
    if amendment_history:
        logger.info(f"   Processing {len(amendment_history)} amendment history entries...")

        for idx, amendment in enumerate(amendment_history):
            description = amendment.get("description", "") or ""

            # Skip if this is the original base (we already added it)
            if "original base" in description.lower():
                logger.info(f"      [{idx+1}] Skipping base entry: {description}")
                continue

            try:
                date_str = amendment.get("date")
                amount = amendment.get("amount")
                source = amendment.get("source", "amendment")

                if not date_str or not amount:
                    logger.warning(f"      [{idx+1}] Missing date or amount, skipping")
                    continue

                period_date = datetime.fromisoformat(str(date_str)).date()

                timeline.add_period(
                    start_date=period_date,
                    amount=float(amount),
                    source=source,
                    reason=description,
                )
                logger.info(
                    f"      [{idx+1}] ✅ Amendment: {period_date} → ₹{amount:,.0f} ({description})"
                )
            except Exception as e:
                logger.error(f"      [{idx+1}] ❌ Failed to parse amendment: {e}")
                continue

    # 🔥 FINALIZE: Sort and dedupe
    timeline.finalize()
    logger.info("=" * 80)

    return timeline
