"""
Feedback Model for Precision Tracking
Allows clients to confirm/reject findings, enabling precision measurement over time.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class FeedbackOutcome(Enum):
    """Possible outcomes for discrepancy feedback."""
    CONFIRMED_VALID = "confirmed_valid"       # Client agrees - real issue
    CONFIRMED_INVALID = "confirmed_invalid"   # Client disagrees - false positive
    PARTIALLY_VALID = "partially_valid"       # Partially correct (e.g., amount wrong)
    UNABLE_TO_VERIFY = "unable_to_verify"     # Client can't determine
    PENDING = "pending"                       # Not yet reviewed


class FeedbackAction(Enum):
    """Action taken by client."""
    DISPUTED_WITH_VENDOR = "disputed"         # Raised with vendor
    CREDIT_RECEIVED = "credit_received"       # Got money back
    WRITE_OFF = "write_off"                   # Decided not worth pursuing
    STILL_INVESTIGATING = "investigating"     # Still looking into it
    NO_ACTION = "no_action"                   # Decided to take no action


@dataclass
class DiscrepancyFeedback:
    """
    Feedback on a specific discrepancy from the client.
    Used to measure and improve precision over time.
    """
    id: str
    discrepancy_id: str
    job_id: str
    customer_id: str
    
    # Our prediction
    our_confidence: float
    our_finding_status: str
    predicted_value: float
    
    # Client feedback
    outcome: FeedbackOutcome = FeedbackOutcome.PENDING
    action_taken: Optional[FeedbackAction] = None
    actual_value: Optional[float] = None  # Actual recovered amount
    client_notes: Optional[str] = None
    
    # Metadata
    created_at: datetime = None
    updated_at: datetime = None
    reviewed_by: Optional[str] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()
        if self.updated_at is None:
            self.updated_at = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "discrepancy_id": self.discrepancy_id,
            "job_id": self.job_id,
            "customer_id": self.customer_id,
            "our_confidence": self.our_confidence,
            "our_finding_status": self.our_finding_status,
            "predicted_value": self.predicted_value,
            "outcome": self.outcome.value,
            "action_taken": self.action_taken.value if self.action_taken else None,
            "actual_value": self.actual_value,
            "client_notes": self.client_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "reviewed_by": self.reviewed_by,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DiscrepancyFeedback":
        return cls(
            id=data.get("id", str(uuid4())),
            discrepancy_id=data["discrepancy_id"],
            job_id=data["job_id"],
            customer_id=data["customer_id"],
            our_confidence=data.get("our_confidence", 0.0),
            our_finding_status=data.get("our_finding_status", "unknown"),
            predicted_value=data.get("predicted_value", 0.0),
            outcome=FeedbackOutcome(data.get("outcome", "pending")),
            action_taken=FeedbackAction(data["action_taken"]) if data.get("action_taken") else None,
            actual_value=data.get("actual_value"),
            client_notes=data.get("client_notes"),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None,
            reviewed_by=data.get("reviewed_by"),
        )


@dataclass
class PrecisionMetrics:
    """
    Aggregated precision metrics for a customer or overall system.
    """
    total_findings: int = 0
    reviewed_findings: int = 0
    
    # Outcomes
    confirmed_valid: int = 0
    confirmed_invalid: int = 0
    partially_valid: int = 0
    unable_to_verify: int = 0
    
    # Financial
    total_predicted_value: float = 0.0
    total_actual_value: float = 0.0
    total_recovered: float = 0.0
    
    # Time period
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    @property
    def precision(self) -> float:
        """
        Calculate precision: confirmed valid / (confirmed valid + confirmed invalid)
        """
        denominator = self.confirmed_valid + self.confirmed_invalid
        if denominator == 0:
            return 0.0
        return self.confirmed_valid / denominator
    
    @property
    def review_rate(self) -> float:
        """Percentage of findings that have been reviewed."""
        if self.total_findings == 0:
            return 0.0
        return self.reviewed_findings / self.total_findings
    
    @property
    def recovery_rate(self) -> float:
        """Percentage of predicted value actually recovered."""
        if self.total_predicted_value == 0:
            return 0.0
        return self.total_recovered / self.total_predicted_value
    
    @property
    def value_accuracy(self) -> float:
        """How accurate our value predictions are."""
        if self.total_predicted_value == 0:
            return 0.0
        return min(1.0, self.total_actual_value / self.total_predicted_value)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_findings": self.total_findings,
            "reviewed_findings": self.reviewed_findings,
            "confirmed_valid": self.confirmed_valid,
            "confirmed_invalid": self.confirmed_invalid,
            "partially_valid": self.partially_valid,
            "unable_to_verify": self.unable_to_verify,
            "total_predicted_value": round(self.total_predicted_value, 2),
            "total_actual_value": round(self.total_actual_value, 2),
            "total_recovered": round(self.total_recovered, 2),
            "precision": round(self.precision, 4),
            "review_rate": round(self.review_rate, 4),
            "recovery_rate": round(self.recovery_rate, 4),
            "value_accuracy": round(self.value_accuracy, 4),
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
        }
    
    def summary(self) -> str:
        """Human-readable summary."""
        return f"""
Precision Metrics Summary
========================
Total Findings: {self.total_findings}
Reviewed: {self.reviewed_findings} ({self.review_rate:.1%})

Outcomes:
  ✓ Confirmed Valid: {self.confirmed_valid}
  ✗ Confirmed Invalid: {self.confirmed_invalid}
  ~ Partially Valid: {self.partially_valid}
  ? Unable to Verify: {self.unable_to_verify}

Precision: {self.precision:.1%}

Financial:
  Predicted: ${self.total_predicted_value:,.2f}
  Actual: ${self.total_actual_value:,.2f}
  Recovered: ${self.total_recovered:,.2f}
  Recovery Rate: {self.recovery_rate:.1%}
"""


class FeedbackRepository:
    """
    Repository for storing and retrieving feedback.
    Uses Supabase for persistence.
    """
    
    def __init__(self):
        self._client = None
    
    def _get_client(self):
        if self._client is None:
            from app.services.storage_supabase import get_client
            self._client = get_client()
        return self._client
    
    def save_feedback(self, feedback: DiscrepancyFeedback) -> bool:
        """Save or update feedback."""
        client = self._get_client()
        if not client:
            logger.warning("Supabase client not available for feedback storage")
            return False
        
        try:
            feedback.updated_at = datetime.utcnow()
            
            client.table("discrepancy_feedback").upsert({
                "id": feedback.id,
                "discrepancy_id": feedback.discrepancy_id,
                "job_id": feedback.job_id,
                "customer_id": feedback.customer_id,
                "our_confidence": feedback.our_confidence,
                "our_finding_status": feedback.our_finding_status,
                "predicted_value": feedback.predicted_value,
                "outcome": feedback.outcome.value,
                "action_taken": feedback.action_taken.value if feedback.action_taken else None,
                "actual_value": feedback.actual_value,
                "client_notes": feedback.client_notes,
                "created_at": feedback.created_at.isoformat(),
                "updated_at": feedback.updated_at.isoformat(),
                "reviewed_by": feedback.reviewed_by,
            }).execute()
            
            return True
        except Exception as e:
            logger.error(f"Failed to save feedback: {e}")
            return False
    
    def get_feedback(self, discrepancy_id: str) -> Optional[DiscrepancyFeedback]:
        """Get feedback for a specific discrepancy."""
        client = self._get_client()
        if not client:
            return None
        
        try:
            response = client.table("discrepancy_feedback").select("*").eq(
                "discrepancy_id", discrepancy_id
            ).limit(1).execute()
            
            if response.data:
                return DiscrepancyFeedback.from_dict(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Failed to get feedback: {e}")
            return None
    
    def get_feedback_for_job(self, job_id: str) -> List[DiscrepancyFeedback]:
        """Get all feedback for a job."""
        client = self._get_client()
        if not client:
            return []
        
        try:
            response = client.table("discrepancy_feedback").select("*").eq(
                "job_id", job_id
            ).execute()
            
            return [DiscrepancyFeedback.from_dict(row) for row in (response.data or [])]
        except Exception as e:
            logger.error(f"Failed to get feedback for job: {e}")
            return []
    
    def calculate_metrics(
        self,
        customer_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> PrecisionMetrics:
        """Calculate precision metrics for a customer or overall."""
        client = self._get_client()
        if not client:
            return PrecisionMetrics()
        
        try:
            query = client.table("discrepancy_feedback").select("*")
            
            if customer_id:
                query = query.eq("customer_id", customer_id)
            if start_date:
                query = query.gte("created_at", start_date.isoformat())
            if end_date:
                query = query.lte("created_at", end_date.isoformat())
            
            response = query.execute()
            feedback_list = [DiscrepancyFeedback.from_dict(row) for row in (response.data or [])]
            
            metrics = PrecisionMetrics(
                total_findings=len(feedback_list),
                start_date=start_date,
                end_date=end_date,
            )
            
            for fb in feedback_list:
                metrics.total_predicted_value += fb.predicted_value
                
                if fb.outcome != FeedbackOutcome.PENDING:
                    metrics.reviewed_findings += 1
                
                if fb.outcome == FeedbackOutcome.CONFIRMED_VALID:
                    metrics.confirmed_valid += 1
                    if fb.actual_value:
                        metrics.total_actual_value += fb.actual_value
                    if fb.action_taken == FeedbackAction.CREDIT_RECEIVED:
                        metrics.total_recovered += fb.actual_value or fb.predicted_value
                        
                elif fb.outcome == FeedbackOutcome.CONFIRMED_INVALID:
                    metrics.confirmed_invalid += 1
                    
                elif fb.outcome == FeedbackOutcome.PARTIALLY_VALID:
                    metrics.partially_valid += 1
                    if fb.actual_value:
                        metrics.total_actual_value += fb.actual_value
                        
                elif fb.outcome == FeedbackOutcome.UNABLE_TO_VERIFY:
                    metrics.unable_to_verify += 1
            
            return metrics
            
        except Exception as e:
            logger.error(f"Failed to calculate metrics: {e}")
            return PrecisionMetrics()


# Singleton repository instance
_feedback_repository: Optional[FeedbackRepository] = None


def get_feedback_repository() -> FeedbackRepository:
    """Get the feedback repository singleton."""
    global _feedback_repository
    if _feedback_repository is None:
        _feedback_repository = FeedbackRepository()
    return _feedback_repository