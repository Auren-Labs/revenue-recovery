"""
Data models for ContractGuard.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
import uuid


def _parse_datetime(value: Any) -> datetime:
    """Parse datetime from string or return datetime object."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # Handle ISO format strings
        if value.endswith('Z'):
            value = value[:-1] + '+00:00'
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            # Try parsing with different formats
            for fmt in ['%Y-%m-%d %H:%M:%S.%f%z', '%Y-%m-%d %H:%M:%S%z', '%Y-%m-%dT%H:%M:%S%z']:
                try:
                    return datetime.strptime(value, fmt)
                except ValueError:
                    continue
            raise ValueError(f"Unable to parse datetime: {value}")
    raise TypeError(f"Expected datetime or string, got {type(value)}")


class SubscriptionTier(str, Enum):
    """Subscription tier levels."""
    TRIAL = "trial"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(str, Enum):
    """Subscription status."""
    ACTIVE = "active"
    CANCELLED = "cancelled"
    PAST_DUE = "past_due"
    SUSPENDED = "suspended"


class UserRole(str, Enum):
    """User roles within an organization."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


@dataclass
class Customer:
    """Organization/Company using ContractGuard."""
    id: str
    name: str
    subscription_tier: SubscriptionTier
    subscription_status: SubscriptionStatus
    created_at: datetime
    updated_at: datetime
    industry: Optional[str] = None
    employee_count: Optional[int] = None
    annual_spend: Optional[float] = None
    stripe_customer_id: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> Customer:
        """Create Customer from database row."""
        return cls(
            id=data["id"],
            name=data["name"],
            subscription_tier=SubscriptionTier(data["subscription_tier"]),
            subscription_status=SubscriptionStatus(data["subscription_status"]),
            created_at=_parse_datetime(data["created_at"]),
            updated_at=_parse_datetime(data["updated_at"]),
            industry=data.get("industry"),
            employee_count=data.get("employee_count"),
            annual_spend=float(data["annual_spend"]) if data.get("annual_spend") else None,
            stripe_customer_id=data.get("stripe_customer_id"),
        )

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "subscription_tier": self.subscription_tier.value,
            "subscription_status": self.subscription_status.value,
            "industry": self.industry,
            "employee_count": self.employee_count,
            "annual_spend": self.annual_spend,
            "stripe_customer_id": self.stripe_customer_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class User:
    """Individual user within a customer organization."""
    id: str
    customer_id: str
    email: str
    full_name: str
    role: UserRole
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    last_login: Optional[datetime] = None

    @classmethod
    def from_dict(cls, data: dict) -> User:
        """Create User from database row."""
        return cls(
            id=data["id"],
            customer_id=data["customer_id"],
            email=data["email"],
            full_name=data["full_name"],
            role=UserRole(data["role"]),
            created_at=_parse_datetime(data["created_at"]),
            updated_at=_parse_datetime(data["updated_at"]),
            is_active=data.get("is_active", True),
            last_login=_parse_datetime(data["last_login"]) if data.get("last_login") else None,
        )

    def to_dict(self) -> dict:
        """Convert to dictionary (excludes password_hash)."""
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role.value,
            "is_active": self.is_active,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def can_create_jobs(self) -> bool:
        """Check if user can create jobs."""
        return self.role in [UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER]

    def can_delete_jobs(self) -> bool:
        """Check if user can delete jobs."""
        return self.role in [UserRole.OWNER, UserRole.ADMIN]

    def can_manage_users(self) -> bool:
        """Check if user can manage other users."""
        return self.role in [UserRole.OWNER, UserRole.ADMIN]


@dataclass
class Job:
    """Audit job for processing contracts and billing data."""
    id: str
    vendor_name: str
    created_at: datetime
    status: str = "queued"
    message: Optional[str] = None
    customer_id: Optional[str] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    stages: List[Dict[str, Any]] = field(default_factory=list)
    contracts: List[Dict[str, Any]] = field(default_factory=list)
    billing_records: List[Dict[str, Any]] = field(default_factory=list)
    discrepancies: List[Dict[str, Any]] = field(default_factory=list)


# ============================================================================
# FEEDBACK MODELS FOR PRECISION TRACKING
# ============================================================================

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

class FeedbackOutcome(Enum):
    """Possible outcomes for discrepancy feedback."""
    CONFIRMED_VALID = "confirmed_valid"
    CONFIRMED_INVALID = "confirmed_invalid"
    PARTIALLY_VALID = "partially_valid"
    UNABLE_TO_VERIFY = "unable_to_verify"
    PENDING = "pending"


class FeedbackAction(Enum):
    """Action taken by client."""
    DISPUTED_WITH_VENDOR = "disputed"
    CREDIT_RECEIVED = "credit_received"
    WRITE_OFF = "write_off"
    STILL_INVESTIGATING = "investigating"
    NO_ACTION = "no_action"


@dataclass
class DiscrepancyFeedback:
    """Feedback on a specific discrepancy from the client."""
    id: str
    discrepancy_id: str
    job_id: str
    customer_id: str
    our_confidence: float
    our_finding_status: str
    predicted_value: float
    outcome: FeedbackOutcome = FeedbackOutcome.PENDING
    action_taken: Optional[FeedbackAction] = None
    actual_value: Optional[float] = None
    client_notes: Optional[str] = None
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
        from uuid import uuid4
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
    """Aggregated precision metrics."""
    total_findings: int = 0
    reviewed_findings: int = 0
    confirmed_valid: int = 0
    confirmed_invalid: int = 0
    partially_valid: int = 0
    unable_to_verify: int = 0
    total_predicted_value: float = 0.0
    total_actual_value: float = 0.0
    total_recovered: float = 0.0
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    @property
    def precision(self) -> float:
        denominator = self.confirmed_valid + self.confirmed_invalid
        if denominator == 0:
            return 0.0
        return self.confirmed_valid / denominator
    
    @property
    def review_rate(self) -> float:
        if self.total_findings == 0:
            return 0.0
        return self.reviewed_findings / self.total_findings
    
    @property
    def recovery_rate(self) -> float:
        if self.total_predicted_value == 0:
            return 0.0
        return self.total_recovered / self.total_predicted_value
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_findings": self.total_findings,
            "reviewed_findings": self.reviewed_findings,
            "confirmed_valid": self.confirmed_valid,
            "confirmed_invalid": self.confirmed_invalid,
            "precision": round(self.precision, 4),
            "review_rate": round(self.review_rate, 4),
            "recovery_rate": round(self.recovery_rate, 4),
            "total_predicted_value": round(self.total_predicted_value, 2),
            "total_recovered": round(self.total_recovered, 2),
        }
