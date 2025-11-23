from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from typing import List

from app.auth import require_user
from app.schemas import UploadResponse, JobStatus
from app.services import job_manager, file_handler, job_repository
from app.services.validators import FileValidator, DataValidator

router = APIRouter()


@router.post("/contracts", response_model=UploadResponse)
async def upload_contracts(
    vendor_name: str = Form(...),
    files: List[UploadFile] = File(..., description="MSA, SOWs, amendments"),
    current_user=Depends(require_user),
) -> UploadResponse:
    # Validate files
    await FileValidator.validate_contract_files(files)
    
    job = job_manager.create_job(vendor_name, current_user.get("organization_id"))
    metadata = await file_handler.store_contracts(job.id, files)
    job_manager.attach_contracts(job, metadata)
    return UploadResponse(job_id=job.id, message="Contracts uploaded. Next, upload billing data.")


@router.post("/{job_id}/billing", response_model=UploadResponse)
async def upload_billing(
    job_id: str,
    files: List[UploadFile] = File(..., description="Billing CSV/XLSX export"),
    current_user=Depends(require_user),
) -> UploadResponse:
    job = job_manager.get_job(job_id, current_user.get("organization_id"))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    
    # Validate files
    await FileValidator.validate_billing_files(files)
    # Validate data content
    await DataValidator.validate_billing_files_data(files)
    
    metadata = await file_handler.store_billing(job.id, files)
    job_manager.attach_billing(job, metadata)
    return UploadResponse(job_id=job.id, message="Billing data received. Run the audit when ready.")


@router.post("/{job_id}/submit", response_model=UploadResponse)
async def submit_job(job_id: str, current_user=Depends(require_user)) -> UploadResponse:
    job = job_manager.get_job(job_id, current_user.get("organization_id"))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not job.contracts:
        raise HTTPException(status_code=400, detail="Contracts missing.")
    if not job.billing_records:
        raise HTTPException(status_code=400, detail="Billing data missing.")
    job_manager.enqueue_job(job_id)
    return UploadResponse(job_id=job_id, message="Audit is running. You will see metrics on the dashboard shortly.")


@router.get("/history")
async def audit_history(
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(require_user)
):
    """
    Get audit history for the current customer.
    
    Returns:
        List of audit jobs with summary information
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Customer ID not found in token")
    
    jobs = job_repository.list_jobs(customer_id, limit=limit, offset=offset)
    
    # Calculate trends (compare with previous audit for same vendor)
    result = []
    vendor_previous_audits = {}  # Track most recent audit per vendor
    
    for job in jobs:
        vendor = job["vendor_name"]
        previous = vendor_previous_audits.get(vendor)
        
        trend = None
        if previous and previous.get("recoverable_amount"):
            current_amount = job.get("recoverable_amount", 0)
            previous_amount = previous.get("recoverable_amount", 0)
            if previous_amount > 0:
                change_pct = ((current_amount - previous_amount) / previous_amount) * 100
                if abs(change_pct) < 5:
                    trend = {"type": "stable", "change_pct": change_pct, "message": "→ Stable"}
                elif change_pct > 0:
                    trend = {"type": "increase", "change_pct": change_pct, "message": f"↑ +{abs(change_pct):.1f}% vs last audit"}
                else:
                    trend = {"type": "decrease", "change_pct": change_pct, "message": f"↓ {abs(change_pct):.1f}% vs last audit"}
            else:
                trend = {"type": "baseline", "change_pct": 0, "message": "Baseline audit"}
        else:
            trend = {"type": "first", "change_pct": 0, "message": "First audit"}
        
        job["trend"] = trend
        result.append(job)
        
        # Update previous audit for this vendor (only if this is the first time we see it)
        if vendor not in vendor_previous_audits:
            vendor_previous_audits[vendor] = job
    
    return {
        "jobs": result,
        "total": len(result),
        "limit": limit,
        "offset": offset,
    }


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    current_user=Depends(require_user)
):
    """
    Delete an audit job.
    
    Returns:
        Success message
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Customer ID not found in token")
    
    success = job_repository.delete_job(job_id, customer_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or you don't have permission to delete it")
    
    return {"message": "Job deleted successfully"}


@router.get("/{job_id}/status", response_model=JobStatus)
async def job_status(job_id: str, current_user=Depends(require_user)) -> JobStatus:
    job = job_manager.get_job(job_id, current_user.get("organization_id"))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatus(
        job_id=job.id,
        created_at=job.created_at,
        status=job.status,
        message=job.message,
        stages=job.stages,
        metrics=job.metrics,
        progress=job.metrics.get("progress"),
        progress_message=job.metrics.get("progress_message"),
    )

