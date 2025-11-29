"""
Confidence Scoring System for Contract Audit
Provides explainable, multi-factor confidence scoring for discrepancy detection.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from math import prod
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ============================================================================
# CONFIDENCE BREAKDOWN
# ============================================================================

@dataclass
class ConfidenceComponent:
    """A single component of the confidence score."""
    name: str
    score: float  # 0.0 to 1.0
    weight: float  # How much this affects overall score
    reason: str
    details: Optional[str] = None
    
    def weighted_score(self) -> float:
        return self.score * self.weight


@dataclass
class ConfidenceBreakdown:
    """
    Explainable confidence scoring for discrepancy detection.
    
    This provides transparency into WHY a discrepancy was flagged,
    building trust with clients and enabling easier verification.
    """
    
    # Individual components
    classification_confidence: float = 1.0
    classification_reason: str = "Not evaluated"
    
    date_parsing_confidence: float = 1.0
    date_parsing_reason: str = "Not evaluated"
    
    amount_match_confidence: float = 1.0
    amount_match_reason: str = "Not evaluated"
    
    contract_extraction_confidence: float = 1.0
    contract_extraction_reason: str = "Not evaluated"
    
    validation_confidence: float = 1.0
    validation_reason: str = "Not evaluated"
    
    # Additional factors
    _additional_factors: List[ConfidenceComponent] = field(default_factory=list)
    
    # Weights for each component
    WEIGHTS = {
        "classification": 0.20,
        "date_parsing": 0.15,
        "amount_match": 0.25,
        "contract_extraction": 0.20,
        "validation": 0.20,
    }
    
    def add_factor(self, name: str, score: float, weight: float, reason: str, details: str = None):
        """Add an additional confidence factor."""
        self._additional_factors.append(ConfidenceComponent(
            name=name,
            score=score,
            weight=weight,
            reason=reason,
            details=details
        ))
    
    def overall_weighted(self) -> float:
        """
        Calculate overall confidence using weighted average.
        """
        total = (
            self.classification_confidence * self.WEIGHTS["classification"] +
            self.date_parsing_confidence * self.WEIGHTS["date_parsing"] +
            self.amount_match_confidence * self.WEIGHTS["amount_match"] +
            self.contract_extraction_confidence * self.WEIGHTS["contract_extraction"] +
            self.validation_confidence * self.WEIGHTS["validation"]
        )
        
        # Apply additional factors
        for factor in self._additional_factors:
            total *= factor.score  # Multiplicative penalty
        
        return min(1.0, max(0.0, total))
    
    def overall_geometric(self) -> float:
        """
        Calculate overall confidence using geometric mean.
        This penalizes any single weak signal more heavily.
        """
        scores = [
            self.classification_confidence,
            self.date_parsing_confidence,
            self.amount_match_confidence,
            self.contract_extraction_confidence,
            self.validation_confidence,
        ]
        
        # Add additional factors
        scores.extend(factor.score for factor in self._additional_factors)
        
        # Filter out zeros (which would make geometric mean zero)
        scores = [max(0.01, s) for s in scores]
        
        return prod(scores) ** (1 / len(scores))
    
    def overall(self) -> float:
        """
        Get the overall confidence score.
        Uses a combination of weighted and geometric means.
        """
        weighted = self.overall_weighted()
        geometric = self.overall_geometric()
        
        # Use the lower of the two to be conservative
        return min(weighted, geometric)
    
    def weakest_component(self) -> tuple[str, float, str]:
        """
        Identify the weakest component in the confidence chain.
        Returns: (component_name, score, reason)
        """
        components = [
            ("Invoice Classification", self.classification_confidence, self.classification_reason),
            ("Date Parsing", self.date_parsing_confidence, self.date_parsing_reason),
            ("Amount Comparison", self.amount_match_confidence, self.amount_match_reason),
            ("Contract Extraction", self.contract_extraction_confidence, self.contract_extraction_reason),
            ("AI Validation", self.validation_confidence, self.validation_reason),
        ]
        
        # Add additional factors
        for factor in self._additional_factors:
            components.append((factor.name, factor.score, factor.reason))
        
        return min(components, key=lambda x: x[1])
    
    def to_explanation(self) -> str:
        """
        Generate human-readable explanation of confidence scoring.
        """
        lines = [
            f"• Invoice Classification: {self.classification_confidence:.0%} - {self.classification_reason}",
            f"• Date Parsing: {self.date_parsing_confidence:.0%} - {self.date_parsing_reason}",
            f"• Amount Comparison: {self.amount_match_confidence:.0%} - {self.amount_match_reason}",
            f"• Contract Terms: {self.contract_extraction_confidence:.0%} - {self.contract_extraction_reason}",
            f"• AI Validation: {self.validation_confidence:.0%} - {self.validation_reason}",
        ]
        
        for factor in self._additional_factors:
            lines.append(f"• {factor.name}: {factor.score:.0%} - {factor.reason}")
        
        weakest_name, weakest_score, weakest_reason = self.weakest_component()
        lines.append(f"\n⚠️ Weakest signal: {weakest_name} ({weakest_score:.0%})")
        
        lines.append(f"\n📊 Overall Confidence: {self.overall():.0%}")
        
        return "\n".join(lines)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "overall": round(self.overall(), 3),
            "overall_weighted": round(self.overall_weighted(), 3),
            "overall_geometric": round(self.overall_geometric(), 3),
            "components": {
                "classification": {
                    "score": round(self.classification_confidence, 3),
                    "weight": self.WEIGHTS["classification"],
                    "reason": self.classification_reason,
                },
                "date_parsing": {
                    "score": round(self.date_parsing_confidence, 3),
                    "weight": self.WEIGHTS["date_parsing"],
                    "reason": self.date_parsing_reason,
                },
                "amount_match": {
                    "score": round(self.amount_match_confidence, 3),
                    "weight": self.WEIGHTS["amount_match"],
                    "reason": self.amount_match_reason,
                },
                "contract_extraction": {
                    "score": round(self.contract_extraction_confidence, 3),
                    "weight": self.WEIGHTS["contract_extraction"],
                    "reason": self.contract_extraction_reason,
                },
                "validation": {
                    "score": round(self.validation_confidence, 3),
                    "weight": self.WEIGHTS["validation"],
                    "reason": self.validation_reason,
                },
            },
            "additional_factors": [
                {
                    "name": f.name,
                    "score": round(f.score, 3),
                    "weight": f.weight,
                    "reason": f.reason,
                    "details": f.details,
                }
                for f in self._additional_factors
            ],
            "weakest_component": {
                "name": self.weakest_component()[0],
                "score": round(self.weakest_component()[1], 3),
                "reason": self.weakest_component()[2],
            },
            "explanation": self.to_explanation(),
        }


# ============================================================================
# CONFIDENCE BUILDER
# ============================================================================

class ConfidenceBuilder:
    """
    Builder class for constructing confidence breakdowns.
    """
    
    def __init__(self):
        self._breakdown = ConfidenceBreakdown()
    
    def with_classification(self, score: float, reason: str) -> "ConfidenceBuilder":
        """Set classification confidence."""
        self._breakdown.classification_confidence = score
        self._breakdown.classification_reason = reason
        return self
    
    def with_date_parsing(self, score: float, reason: str) -> "ConfidenceBuilder":
        """Set date parsing confidence."""
        self._breakdown.date_parsing_confidence = score
        self._breakdown.date_parsing_reason = reason
        return self
    
    def with_amount_match(self, score: float, reason: str) -> "ConfidenceBuilder":
        """Set amount match confidence."""
        self._breakdown.amount_match_confidence = score
        self._breakdown.amount_match_reason = reason
        return self
    
    def with_contract_extraction(self, score: float, reason: str) -> "ConfidenceBuilder":
        """Set contract extraction confidence."""
        self._breakdown.contract_extraction_confidence = score
        self._breakdown.contract_extraction_reason = reason
        return self
    
    def with_validation(self, score: float, reason: str) -> "ConfidenceBuilder":
        """Set validation confidence."""
        self._breakdown.validation_confidence = score
        self._breakdown.validation_reason = reason
        return self
    
    def with_additional_factor(
        self,
        name: str,
        score: float,
        weight: float = 1.0,
        reason: str = "",
        details: str = None
    ) -> "ConfidenceBuilder":
        """Add an additional confidence factor."""
        self._breakdown.add_factor(name, score, weight, reason, details)
        return self
    
    def build(self) -> ConfidenceBreakdown:
        """Build and return the confidence breakdown."""
        return self._breakdown


# ============================================================================
# CONFIDENCE AGGREGATOR
# ============================================================================

def aggregate_confidence_from_items(
    items: List[Dict[str, Any]],
    key: str = "confidence"
) -> float:
    """
    Aggregate confidence from multiple items.
    Returns the minimum confidence (conservative approach).
    """
    if not items:
        return 0.5
    
    confidences = [item.get(key, 0.5) for item in items if key in item]
    
    if not confidences:
        return 0.5
    
    # Return minimum (most conservative)
    return min(confidences)


def combine_confidences(*scores: float, method: str = "geometric") -> float:
    """
    Combine multiple confidence scores into a single score.
    
    Args:
        *scores: Variable number of confidence scores (0-1)
        method: "geometric" (default), "weighted", "minimum", or "average"
        
    Returns:
        Combined confidence score
    """
    if not scores:
        return 0.5
    
    # Filter out None values
    valid_scores = [s for s in scores if s is not None]
    
    if not valid_scores:
        return 0.5
    
    if method == "minimum":
        return min(valid_scores)
    
    if method == "average":
        return sum(valid_scores) / len(valid_scores)
    
    if method == "geometric":
        # Prevent zeros
        safe_scores = [max(0.01, s) for s in valid_scores]
        return prod(safe_scores) ** (1 / len(safe_scores))
    
    # Default: weighted (but equal weights)
    return sum(valid_scores) / len(valid_scores)


# ============================================================================
# CONFIDENCE THRESHOLDS
# ============================================================================

@dataclass
class ConfidenceThresholds:
    """Configurable confidence thresholds."""
    
    # Minimum to surface any finding
    minimum_to_surface: float = 0.75
    
    # Minimum to mark as "confirmed"
    minimum_for_confirmed: float = 0.85
    
    # Below this, mark as "likely false positive"
    false_positive_threshold: float = 0.50
    
    # Below this, mark as "insufficient data"
    insufficient_data_threshold: float = 0.40
    
    def classify(self, confidence: float) -> str:
        """Classify based on confidence score."""
        if confidence >= self.minimum_for_confirmed:
            return "confirmed"
        elif confidence >= self.minimum_to_surface:
            return "needs_review"
        elif confidence >= self.false_positive_threshold:
            return "likely_false_positive"
        else:
            return "insufficient_data"
    
    def should_surface(self, confidence: float) -> bool:
        """Check if finding should be surfaced to client."""
        return confidence >= self.minimum_to_surface


# Default thresholds instance
DEFAULT_THRESHOLDS = ConfidenceThresholds()


# ============================================================================
# EXPLANATION GENERATOR
# ============================================================================

def generate_confidence_explanation(
    breakdown: ConfidenceBreakdown,
    financial_impact: float,
    currency: str = "INR"
) -> str:
    """
    Generate a client-friendly explanation of the confidence scoring.
    """
    overall = breakdown.overall()
    
    # Determine confidence level description
    if overall >= 0.9:
        level_desc = "Very High"
        emoji = "🟢"
    elif overall >= 0.8:
        level_desc = "High"
        emoji = "🟢"
    elif overall >= 0.7:
        level_desc = "Good"
        emoji = "🟡"
    elif overall >= 0.6:
        level_desc = "Moderate"
        emoji = "🟡"
    else:
        level_desc = "Low"
        emoji = "🔴"
    
    weakest_name, weakest_score, weakest_reason = breakdown.weakest_component()
    
    explanation = f"""
{emoji} **Confidence: {level_desc} ({overall:.0%})**

**Why we flagged this:**
{breakdown.to_explanation()}

**Financial Impact:** {currency} {financial_impact:,.2f}

**Recommendation:** {"Review and dispute with vendor" if overall >= 0.75 else "Verify manually before taking action"}
"""
    
    return explanation.strip()