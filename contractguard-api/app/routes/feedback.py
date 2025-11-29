"""
API Endpoints for Discrepancy Feedback
Allows clients to confirm/reject findings and view precision metrics.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

# To this:
from app.models import (
    DiscrepancyFeedback,
    FeedbackOutcome,
    FeedbackAction,
    PrecisionMetrics,
)

from app.services import job_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class SubmitFeedbackRequest(BaseModel):
    """Request to submit feedback on a discrepancy."""
    discrepancy_id: str
    job_id: str
    outcome: str = Field(..., description="confirmed_valid, confirmed_invalid, partially_valid, unable_to_verify")
    action_taken: Optional[str] = Field(None, description="disputed, credit_received, write_off, investigating, no_action")
    actual_value: Optional[float] = Field(None, description="Actual amount if different from predicted")
    notes: Optional[str] = Field(None, description="Additional notes from reviewer")


class FeedbackResponse(BaseModel):
    """Response after submitting feedback."""
    id: str
    discrepancy_id: str
    job_id: str
    outcome: str
    action_taken: Optional[str]
    actual_value: Optional[float]
    created_at: str
    message: str


class PrecisionMetricsResponse(BaseModel):
    """Precision metrics response."""
    total_findings: int
    reviewed_findings: int
    confirmed_valid: int
    confirmed_invalid: int
    partially_valid: int
    unable_to_verify: int
    precision: float
    review_rate: float
    recovery_rate: float
    value_accuracy: float
    total_predicted_value: float
    total_actual_value: float
    total_recovered: float
    start_date: Optional[str]
    end_date: Optional[str]


class JobFeedbackSummary(BaseModel):
    """Summary of feedback for a job."""
    job_id: str
    total_discrepancies: int
    reviewed: int
    pending: int
    confirmed_valid: int
    confirmed_invalid: int
    precision: Optional[float]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _get_customer_id_from_request(request) -> str:
    """Extract customer ID from request context."""
    # In production, this would come from auth middleware
    # For now, we'll use a header or default
    return getattr(request.state, 'customer_id', 'default')


def _get_discrepancy_from_job(job_id: str, discrepancy_id: str, customer_id: str) -> Optional[dict]:
    """Get a specific discrepancy from a job."""
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        return None
    
    for disc in job.discrepancies:
        # Match by some identifier - could be index or a generated ID
        if disc.get('id') == discrepancy_id or str(job.discrepancies.index(disc)) == discrepancy_id:
            return disc
    
    return None


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/submit", response_model=FeedbackResponse)
async def submit_feedback(
    request: SubmitFeedbackRequest,
    customer_id: str = Query(..., description="Customer ID")
):
    """
    Submit feedback on a discrepancy finding.
    
    This allows clients to confirm or reject our findings,
    which helps us measure and improve precision over time.
    """
    # Validate outcome
    try:
        outcome = FeedbackOutcome(request.outcome)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid outcome. Must be one of: {[e.value for e in FeedbackOutcome]}"
        )
    
    # Validate action if provided
    action = None
    if request.action_taken:
        try:
            action = FeedbackAction(request.action_taken)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action. Must be one of: {[e.value for e in FeedbackAction]}"
            )
    
    # Get the job and discrepancy
    job = job_manager.get_job(request.job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Find the discrepancy
    discrepancy = None
    for idx, disc in enumerate(job.discrepancies):
        if str(idx) == request.discrepancy_id or disc.get('id') == request.discrepancy_id:
            discrepancy = disc
            break
    
    if not discrepancy:
        raise HTTPException(status_code=404, detail="Discrepancy not found")
    
    # Create feedback record
    feedback = DiscrepancyFeedback(
        id=str(uuid4()),
        discrepancy_id=request.discrepancy_id,
        job_id=request.job_id,
        customer_id=customer_id,
        our_confidence=discrepancy.get('confidence', 0.0),
        our_finding_status=discrepancy.get('finding_status', 'unknown'),
        predicted_value=discrepancy.get('value', 0.0),
        outcome=outcome,
        action_taken=action,
        actual_value=request.actual_value,
        client_notes=request.notes,
    )
    
    # Save feedback
    repo = get_feedback_repository()
    success = repo.save_feedback(feedback)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save feedback")
    
    logger.info(f"Feedback submitted for discrepancy {request.discrepancy_id}: {outcome.value}")
    
    return FeedbackResponse(
        id=feedback.id,
        discrepancy_id=feedback.discrepancy_id,
        job_id=feedback.job_id,
        outcome=feedback.outcome.value,
        action_taken=feedback.action_taken.value if feedback.action_taken else None,
        actual_value=feedback.actual_value,
        created_at=feedback.created_at.isoformat(),
        message="Feedback submitted successfully"
    )


@router.get("/discrepancy/{discrepancy_id}", response_model=Optional[FeedbackResponse])
async def get_feedback(
    discrepancy_id: str,
    customer_id: str = Query(..., description="Customer ID")
):
    """Get existing feedback for a discrepancy."""
    repo = get_feedback_repository()
    feedback = repo.get_feedback(discrepancy_id)
    
    if not feedback:
        return None
    
    # Verify customer access
    if feedback.customer_id != customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FeedbackResponse(
        id=feedback.id,
        discrepancy_id=feedback.discrepancy_id,
        job_id=feedback.job_id,
        outcome=feedback.outcome.value,
        action_taken=feedback.action_taken.value if feedback.action_taken else None,
        actual_value=feedback.actual_value,
        created_at=feedback.created_at.isoformat(),
        message="Feedback retrieved"
    )


@router.get("/job/{job_id}/summary", response_model=JobFeedbackSummary)
async def get_job_feedback_summary(
    job_id: str,
    customer_id: str = Query(..., description="Customer ID")
):
    """Get feedback summary for a specific job."""
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    repo = get_feedback_repository()
    feedback_list = repo.get_feedback_for_job(job_id)
    
    total = len(job.discrepancies)
    reviewed = len([f for f in feedback_list if f.outcome != FeedbackOutcome.PENDING])
    confirmed_valid = len([f for f in feedback_list if f.outcome == FeedbackOutcome.CONFIRMED_VALID])
    confirmed_invalid = len([f for f in feedback_list if f.outcome == FeedbackOutcome.CONFIRMED_INVALID])
    
    precision = None
    if confirmed_valid + confirmed_invalid > 0:
        precision = confirmed_valid / (confirmed_valid + confirmed_invalid)
    
    return JobFeedbackSummary(
        job_id=job_id,
        total_discrepancies=total,
        reviewed=reviewed,
        pending=total - reviewed,
        confirmed_valid=confirmed_valid,
        confirmed_invalid=confirmed_invalid,
        precision=precision
    )


@router.get("/metrics", response_model=PrecisionMetricsResponse)
async def get_precision_metrics(
    customer_id: str = Query(..., description="Customer ID"),
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)")
):
    """
    Get precision metrics for a customer.
    
    This shows how accurate our findings have been based on client feedback.
    Target: 95%+ precision before scaling.
    """
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    repo = get_feedback_repository()
    metrics = repo.calculate_metrics(customer_id, start, end)
    
    return PrecisionMetricsResponse(
        total_findings=metrics.total_findings,
        reviewed_findings=metrics.reviewed_findings,
        confirmed_valid=metrics.confirmed_valid,
        confirmed_invalid=metrics.confirmed_invalid,
        partially_valid=metrics.partially_valid,
        unable_to_verify=metrics.unable_to_verify,
        precision=round(metrics.precision, 4),
        review_rate=round(metrics.review_rate, 4),
        recovery_rate=round(metrics.recovery_rate, 4),
        value_accuracy=round(metrics.value_accuracy, 4),
        total_predicted_value=round(metrics.total_predicted_value, 2),
        total_actual_value=round(metrics.total_actual_value, 2),
        total_recovered=round(metrics.total_recovered, 2),
        start_date=start.isoformat() if start else None,
        end_date=end.isoformat() if end else None
    )


@router.get("/metrics/overall", response_model=PrecisionMetricsResponse)
async def get_overall_precision_metrics(
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)")
):
    """
    Get system-wide precision metrics (admin only).
    
    This shows overall system accuracy across all customers.
    """
    # In production, add admin auth check here
    
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    repo = get_feedback_repository()
    metrics = repo.calculate_metrics(customer_id=None, start_date=start, end_date=end)
    
    return PrecisionMetricsResponse(
        total_findings=metrics.total_findings,
        reviewed_findings=metrics.reviewed_findings,
        confirmed_valid=metrics.confirmed_valid,
        confirmed_invalid=metrics.confirmed_invalid,
        partially_valid=metrics.partially_valid,
        unable_to_verify=metrics.unable_to_verify,
        precision=round(metrics.precision, 4),
        review_rate=round(metrics.review_rate, 4),
        recovery_rate=round(metrics.recovery_rate, 4),
        value_accuracy=round(metrics.value_accuracy, 4),
        total_predicted_value=round(metrics.total_predicted_value, 2),
        total_actual_value=round(metrics.total_actual_value, 2),
        total_recovered=round(metrics.total_recovered, 2),
        start_date=start.isoformat() if start else None,
        end_date=end.isoformat() if end else None
    )


@router.put("/update/{feedback_id}", response_model=FeedbackResponse)
async def update_feedback(
    feedback_id: str,
    request: SubmitFeedbackRequest,
    customer_id: str = Query(..., description="Customer ID")
):
    """Update existing feedback."""
    repo = get_feedback_repository()
    existing = repo.get_feedback(request.discrepancy_id)
    
    if not existing:
        raise HTTPException(status_code=404, detail="Feedback not found")
    
    if existing.customer_id != customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Validate outcome
    try:
        outcome = FeedbackOutcome(request.outcome)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid outcome. Must be one of: {[e.value for e in FeedbackOutcome]}"
        )
    
    # Validate action if provided
    action = None
    if request.action_taken:
        try:
            action = FeedbackAction(request.action_taken)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action. Must be one of: {[e.value for e in FeedbackAction]}"
            )
    
    # Update fields
    existing.outcome = outcome
    existing.action_taken = action
    existing.actual_value = request.actual_value
    existing.client_notes = request.notes
    
    success = repo.save_feedback(existing)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update feedback")
    
    return FeedbackResponse(
        id=existing.id,
        discrepancy_id=existing.discrepancy_id,
        job_id=existing.job_id,
        outcome=existing.outcome.value,
        action_taken=existing.action_taken.value if existing.action_taken else None,
        actual_value=existing.actual_value,
        created_at=existing.created_at.isoformat(),
        message="Feedback updated successfully"
    )