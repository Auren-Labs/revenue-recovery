from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from typing import List

from app.auth import require_user
from app.schemas import UploadResponse, JobStatus
from app.services import job_manager, file_handler

router = APIRouter()


@router.post("/contracts", response_model=UploadResponse)
async def upload_contracts(
    vendor_name: str = Form(...),
    files: List[UploadFile] = File(..., description="MSA, SOWs, amendments"),
    current_user=Depends(require_user),
) -> UploadResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Contract files are required.")
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
    if not files:
        raise HTTPException(status_code=400, detail="Billing file required.")
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
    )

