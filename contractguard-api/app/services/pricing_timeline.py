"""
FIXED Pricing Timeline Builder

KEY FIX: Amendments that specify a new base amount should REPLACE the base,
not ADD to it. The system was incorrectly treating amendment base prices
as add-ons, causing wildly inflated expected amounts.

EXAMPLE:
- Original contract: ₹100,000/month
- Jan 2025 escalation: ₹105,000/month (5% increase)
- Mar 2025 amendment: "Base fee amended to ₹110,000"

WRONG (what was happening):
  ₹100,000 + ₹110,000 + 5% = ₹220,500

CORRECT (what should happen):
  Mar 2025+: ₹110,000 (amendment REPLACES base)
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
import logging
import re

logger = logging.getLogger(__name__)


@dataclass
class PricingPeriod:
    """A period with a specific expected price."""
    start_date: date
    amount: float
    source: str
    reason: str
    components: Dict[str, float] = field(default_factory=dict)


@dataclass
class PricingTimeline:
    """Timeline of expected prices across contract periods."""
    periods: List[PricingPeriod] = field(default_factory=list)
    
    def get_expected_amount(self, check_date: date) -> Tuple[float, str]:
        """
        Get expected amount for a specific date.
        Returns (amount, reason).
        """
        if not self.periods:
            return (0.0, "No pricing periods defined")
        
        # Find the applicable period (latest period that starts on or before check_date)
        applicable_period = None
        for period in sorted(self.periods, key=lambda p: p.start_date):
            if period.start_date <= check_date:
                applicable_period = period
        
        if applicable_period:
            return (applicable_period.amount, applicable_period.reason)
        
        # If check_date is before all periods, use the first period
        first_period = min(self.periods, key=lambda p: p.start_date)
        return (first_period.amount, f"Before contract start, using: {first_period.reason}")


def _parse_date(date_str: str) -> Optional[date]:
    """Parse date string to date object."""
    if not date_str:
        return None
    
    if isinstance(date_str, date):
        return date_str
    
    if isinstance(date_str, datetime):
        return date_str.date()
    
    # Try various formats
    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(str(date_str), fmt).date()
        except ValueError:
            continue
    
    # Try ISO format
    try:
        return datetime.fromisoformat(str(date_str).replace('Z', '+00:00')).date()
    except (ValueError, TypeError):
        pass
    
    return None


def _is_original_base(amendment: Dict[str, Any]) -> bool:
    """Check if this is the original base pricing entry (should be skipped)."""
    description = str(amendment.get("description", "")).lower()
    return "original base" in description or "original pricing" in description


def _is_escalation_entry(amendment: Dict[str, Any]) -> bool:
    """Check if this is an escalation entry (handled separately)."""
    description = str(amendment.get("description", "")).lower()
    source = str(amendment.get("source", "")).lower()
    return "escalation" in description or source == "escalation clause"


def _is_base_replacement_amendment(amendment: Dict[str, Any]) -> bool:
    """
    Determine if an amendment REPLACES the base or ADDS to it.
    
    REPLACES if:
    - Description contains "amended to", "new base", "replaces", "modified to"
    - Source is an amendment document (not original contract)
    
    ADDS if:
    - Description contains "additional", "add-on", "new service", "package"
    """
    description = str(amendment.get("description", "")).lower()
    source = str(amendment.get("source", "")).lower()
    
    # Skip original base and escalation entries
    if _is_original_base(amendment) or _is_escalation_entry(amendment):
        return False
    
    # Keywords indicating REPLACEMENT
    replacement_keywords = [
        "amended to", "new base", "replaces", "modified to",
        "changed to", "updated to", "revised to", "base monthly fee",
        "expanded", "scope expansion"
    ]
    
    # Keywords indicating ADDITION (add-on services)
    addition_keywords = [
        "additional service", "add-on", "addon", "new service", 
        "audit logs package", "package", "module"
    ]
    
    # Check for replacement indicators
    is_replacement = any(kw in description for kw in replacement_keywords)
    
    # Check for addition indicators  
    is_addition = any(kw in description for kw in addition_keywords)
    
    # If explicitly marked as addition, don't treat as replacement
    if is_addition and not is_replacement:
        return False
    
    # If from an amendment document and has a significant base-like amount
    if "amendment" in source:
        return True
    
    return is_replacement


def build_pricing_timeline(rules: Dict[str, Any]) -> PricingTimeline:
    """
    Build a pricing timeline from contract rules.
    
    KEY FIX: Properly handle amendments that REPLACE vs ADD to base.
    """
    timeline = PricingTimeline()
    
    base_amount = float(rules.get("base_amount", 0))
    escalation_rate = float(rules.get("escalation_rate", 0))
    
    # Parse dates
    base_start_str = rules.get("base_start_date", "2024-01-01")
    base_start = _parse_date(base_start_str) or date(2024, 1, 1)
    
    escalation_start_str = rules.get("effective_start_date")
    escalation_start = _parse_date(escalation_start_str) if escalation_start_str else None
    
    # Get amendment history
    amendments = rules.get("amendment_history", [])
    
    # Categorize amendments
    base_replacements = []  # Amendments that REPLACE the base
    add_ons = []            # Amendments that ADD to the base
    escalation_events = []  # Escalation applications
    
    for amendment in amendments:
        amendment_date = _parse_date(amendment.get("date"))
        if not amendment_date:
            continue
        
        description = str(amendment.get("description", "")).lower()
        amount = float(amendment.get("amount", 0))
        source = str(amendment.get("source", ""))
        
        # Skip original base entry (already handled as base_amount)
        if _is_original_base(amendment):
            logger.info(f"⏭️ Skipping original base entry: {amendment_date} → ₹{amount:,.0f}")
            continue
        
        # Skip escalation entries (handled separately via effective_start_date)
        if _is_escalation_entry(amendment):
            logger.info(f"⏭️ Skipping escalation entry: {amendment_date}")
            continue
        
        # Determine if this is a replacement or addition
        if _is_base_replacement_amendment(amendment):
            base_replacements.append({
                "date": amendment_date,
                "amount": amount,
                "source": source,
                "description": amendment.get("description", ""),
            })
            logger.info(f"📝 Base REPLACEMENT: {amendment_date} → ₹{amount:,.0f} ({source})")
        else:
            add_ons.append({
                "date": amendment_date,
                "amount": amount,
                "source": source,
                "description": amendment.get("description", ""),
            })
            logger.info(f"➕ Add-on: {amendment_date} → ₹{amount:,.0f} ({source})")
    
    # Build timeline periods
    # Start with the original base
    current_base = base_amount
    current_addons = 0.0
    addon_descriptions = []
    
    # Period 1: Original base (before any changes)
    timeline.periods.append(PricingPeriod(
        start_date=base_start,
        amount=current_base,
        source="pricing_engine",
        reason="Base pricing",
        components={"base": current_base}
    ))
    
    # Collect all change events and sort by date
    all_events = []
    
    # Add escalation event
    if escalation_start and escalation_rate > 0:
        all_events.append({
            "type": "escalation",
            "date": escalation_start,
            "rate": escalation_rate,
        })
    
    # Add base replacements
    for br in base_replacements:
        all_events.append({
            "type": "base_replacement",
            "date": br["date"],
            "amount": br["amount"],
            "source": br["source"],
            "description": br["description"],
        })
    
    # Add add-ons
    for ao in add_ons:
        all_events.append({
            "type": "addon",
            "date": ao["date"],
            "amount": ao["amount"],
            "source": ao["source"],
            "description": ao["description"],
        })
    
    # Sort events by date
    all_events.sort(key=lambda e: e["date"])
    
    # Track state
    escalation_applied = False
    
    # Process events in order
    for event in all_events:
        event_date = event["date"]
        
        if event["type"] == "escalation":
            # Apply escalation to current base
            rate = event["rate"]
            escalated_base = current_base * (1 + rate)
            escalated_addons = current_addons * (1 + rate)  # Addons also escalate
            
            total = escalated_base + escalated_addons
            
            reason_parts = ["Base pricing"]
            if addon_descriptions:
                reason_parts.append(" + ".join(addon_descriptions))
            reason_parts.append(f"{rate*100:.2f}% escalation")
            
            timeline.periods.append(PricingPeriod(
                start_date=event_date,
                amount=total,
                source="pricing_engine",
                reason=" + ".join(reason_parts),
                components={
                    "base": escalated_base,
                    "addons": escalated_addons,
                    "escalation_rate": rate,
                }
            ))
            
            current_base = escalated_base
            current_addons = escalated_addons
            escalation_applied = True
            
            logger.info(f"📈 Escalation applied: {event_date} → ₹{total:,.0f}")
        
        elif event["type"] == "base_replacement":
            # REPLACE the base (not add to it!)
            new_base = event["amount"]
            
            # If escalation was already applied, DON'T re-escalate the new base
            # The amendment specifies the new effective rate
            total = new_base + current_addons
            
            reason_parts = [event.get("description", "Amended base")]
            if current_addons > 0 and addon_descriptions:
                reason_parts.append(" + ".join(addon_descriptions))
            
            timeline.periods.append(PricingPeriod(
                start_date=event_date,
                amount=total,
                source="pricing_engine",
                reason=" + ".join(reason_parts),
                components={
                    "base": new_base,
                    "addons": current_addons,
                    "amendment": event.get("source", ""),
                }
            ))
            
            current_base = new_base
            logger.info(f"📝 Base replaced: {event_date} → ₹{total:,.0f}")
        
        elif event["type"] == "addon":
            # ADD to the current total
            addon_amount = event["amount"]
            addon_desc = event.get("description", "Add-on service")
            
            current_addons += addon_amount
            addon_descriptions.append(addon_desc)
            
            total = current_base + current_addons
            
            reason_parts = ["Base pricing"]
            reason_parts.append(addon_desc)
            if escalation_applied:
                reason_parts.append(f"{escalation_rate*100:.2f}% escalation")
            
            timeline.periods.append(PricingPeriod(
                start_date=event_date,
                amount=total,
                source="pricing_engine",
                reason=" + ".join(reason_parts),
                components={
                    "base": current_base,
                    "addons": current_addons,
                    "latest_addon": addon_desc,
                }
            ))
            
            logger.info(f"➕ Add-on added: {event_date} → ₹{total:,.0f}")
    
    # Log final timeline
    logger.info("="*50)
    logger.info("PRICING TIMELINE:")
    for period in timeline.periods:
        logger.info(f"  {period.start_date}: ₹{period.amount:,.0f} ({period.reason})")
    logger.info("="*50)
    
    return timeline