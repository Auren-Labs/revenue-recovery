"""
Automated Dispute Letter Generation API Endpoints
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from app.auth import require_user
from app.services import dispute_generator

router = APIRouter(prefix="/api/v1/disputes", tags=["disputes"])


class GenerateDisputeRequest(BaseModel):
    """Request to generate a dispute letter."""
    job_id: str = Field(..., description="Job ID")
    discrepancy_id: str = Field(..., description="Discrepancy ID or index")
    vendor_contact: Optional[str] = Field(None, description="Vendor contact email")


class DisputeLetterResponse(BaseModel):
    """Response with generated dispute letter."""
    letter: str = Field(..., description="Generated dispute letter")
    metadata: Dict[str, Any] = Field(..., description="Letter metadata")
    attachments: Dict[str, Any] = Field(..., description="Suggested attachments")


@router.post("/generate", response_model=DisputeLetterResponse)
async def generate_dispute(
    request: GenerateDisputeRequest,
    current_user=Depends(require_user)
):
    """
    Generate a professional dispute letter for a billing discrepancy.
    
    The letter includes:
    - Clear statement of the discrepancy
    - Contract references
    - Request for credit/adjustment
    - Professional tone
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    
    try:
        result = await dispute_generator.generate_dispute_letter(
            job_id=request.job_id,
            discrepancy_id=request.discrepancy_id,
            customer_id=customer_id,
            vendor_contact=request.vendor_contact
        )
        return DisputeLetterResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate letter: {str(e)}")


@router.get("/preview/{job_id}/{discrepancy_id}")
async def preview_dispute(
    job_id: str,
    discrepancy_id: str,
    vendor_contact: Optional[str] = Query(None),
    current_user=Depends(require_user)
):
    """Preview dispute letter without generating full version."""
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    
    try:
        result = await dispute_generator.generate_dispute_letter(
            job_id=job_id,
            discrepancy_id=discrepancy_id,
            customer_id=customer_id,
            vendor_contact=vendor_contact
        )
        return DisputeLetterResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to preview letter: {str(e)}")

