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
    user_type: str = Form("customer"),  # "customer" or "vendor"
    files: List[UploadFile] = File(..., description="MSA, SOWs, amendments"),
    current_user=Depends(require_user),
) -> UploadResponse:
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"Starting contract upload for vendor: {vendor_name}, files: {len(files)}")
    
    try:
        # Validate files (should be quick)
        logger.info("Validating contract files...")
        await FileValidator.validate_contract_files(files)
        logger.info("File validation complete")
        
        # Create job in async-safe way with timeout
        logger.info("Creating job record...")
        try:
            # Validate user_type
            if user_type not in ["customer", "vendor"]:
                user_type = "customer"  # Default to customer if invalid
            
            job = await asyncio.wait_for(
                asyncio.to_thread(
                    job_manager.create_job,
                    vendor_name,
                    current_user.get("organization_id"),
                    user_type
                ),
                timeout=10.0  # 10 second timeout for job creation
            )
            logger.info(f"Job created: {job.id}")
        except asyncio.TimeoutError:
            logger.error("Job creation timed out after 10 seconds")
            raise HTTPException(status_code=504, detail="Job creation timed out. Please try again.")
        except Exception as e:
            logger.error(f"Job creation failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to create job: {str(e)}")
        
        # Store files (already has timeout handling)
        logger.info(f"Storing {len(files)} contract file(s)...")
        try:
            metadata = await asyncio.wait_for(
                file_handler.store_contracts(job.id, files),
                timeout=300.0  # 5 minute timeout for file storage
            )
            logger.info(f"Files stored successfully: {len(metadata)} file(s)")
        except asyncio.TimeoutError:
            logger.error("File storage timed out after 5 minutes")
            raise HTTPException(status_code=504, detail="File storage timed out. Please try again.")
        except Exception as e:
            logger.error(f"File storage failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to store files: {str(e)}")
        
        # Attach contracts in async-safe way (non-blocking, can fail)
        logger.info("Attaching contract metadata...")
        try:
            await asyncio.wait_for(
                asyncio.to_thread(job_manager.attach_contracts, job, metadata),
                timeout=10.0  # 10 second timeout for metadata attachment
            )
            logger.info("Contract metadata attached successfully")
        except asyncio.TimeoutError:
            logger.warning("Metadata attachment timed out, but files are stored")
        except Exception as e:
            # Log but don't fail - files are stored
            logger.warning(f"Failed to attach contracts metadata (non-critical): {e}")
        
        # Mark upload stage as completed (important for frontend status polling)
        logger.info("Marking upload stage as completed...")
        try:
            await asyncio.wait_for(
                asyncio.to_thread(
                    job_manager.update_stage,
                    job,
                    "upload",
                    "completed",
                    f"Stored {len(metadata)} contract file(s) successfully"
                ),
                timeout=5.0
            )
            logger.info("Upload stage marked as completed")
        except Exception as e:
            logger.warning(f"Failed to update upload stage status (non-critical): {e}")
        
        logger.info(f"Contract upload complete for job {job.id}")
        return UploadResponse(job_id=job.id, message="Contracts uploaded. Next, upload billing data.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in contract upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/{job_id}/billing", response_model=UploadResponse)
async def upload_billing(
    job_id: str,
    files: List[UploadFile] = File(..., description="Billing CSV/XLSX export"),
    current_user=Depends(require_user),
) -> UploadResponse:
    import asyncio
    import logging
    
    # Get job in async-safe way
    try:
        job = await asyncio.wait_for(
            asyncio.to_thread(
                job_manager.get_job,
                job_id,
                current_user.get("organization_id")
            ),
            timeout=5.0  # 5 second timeout
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Failed to load job. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading job: {str(e)}")
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    
    # Validate files
    await FileValidator.validate_billing_files(files)
    # Validate data content
    await DataValidator.validate_billing_files_data(files)
    
    # Store files (already has timeout handling)
    metadata = await file_handler.store_billing(job.id, files)
    
    # Attach billing in async-safe way
    try:
        await asyncio.to_thread(job_manager.attach_billing, job, metadata)
    except Exception as e:
        # Log but don't fail - files are stored
        logging.getLogger(__name__).error(f"Failed to attach billing metadata: {e}")
    
    # Mark upload stage as completed if not already (in case billing was uploaded first)
    # This ensures the frontend sees the upload stage as complete
    try:
        await asyncio.wait_for(
            asyncio.to_thread(
                job_manager.update_stage,
                job,
                "upload",
                "completed",
                f"Stored {len(metadata)} billing file(s) successfully"
            ),
            timeout=5.0
        )
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to update upload stage status (non-critical): {e}")
    
    return UploadResponse(job_id=job.id, message="Billing data received. Run the audit when ready.")


@router.post("/{job_id}/submit", response_model=UploadResponse)
async def submit_job(job_id: str, current_user=Depends(require_user)) -> UploadResponse:
    """Submit job for processing. Non-blocking."""
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    
    # Get job in async-safe way
    try:
        job = await asyncio.wait_for(
            asyncio.to_thread(
                job_manager.get_job,
                job_id,
                current_user.get("organization_id")
            ),
            timeout=5.0
        )
    except asyncio.TimeoutError:
        logger.error(f"Job lookup timed out for job {job_id}")
        raise HTTPException(status_code=504, detail="Failed to load job. Please try again.")
    except Exception as e:
        logger.error(f"Failed to get job: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get job: {str(e)}")
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not job.contracts:
        raise HTTPException(status_code=400, detail="Contracts missing.")
    if not job.billing_records:
        raise HTTPException(status_code=400, detail="Billing data missing.")
    
    # Enqueue job (non-blocking) - start pipeline directly
    logger.info(f"Starting pipeline for job {job_id}...")
    try:
        # Start pipeline directly in background instead of using enqueue_job
        # This ensures it actually starts
        import threading
        def start_pipeline():
            import asyncio
            try:
                logger.info(f"Pipeline thread started for job {job_id}")
                asyncio.run(job_manager.run_pipeline_async(job_id))
            except Exception as e:
                logger.error(f"Pipeline error for job {job_id}: {e}", exc_info=True)
                try:
                    job = job_manager.get_job(job_id)
                    if job:
                        job_manager.set_job_status(job, "failed", f"Pipeline error: {str(e)}")
                except:
                    pass
        
        thread = threading.Thread(target=start_pipeline, daemon=False, name=f"pipeline-{job_id}")
        thread.start()
        logger.info(f"Pipeline thread started for job {job_id} (thread: {thread.name}, alive: {thread.is_alive()})")
        
        # Give it a moment to start, then verify
        import time
        time.sleep(0.1)  # 100ms to let thread start
        if not thread.is_alive():
            logger.error(f"Pipeline thread for job {job_id} died immediately!")
            raise HTTPException(status_code=500, detail="Failed to start pipeline thread")
    except Exception as e:
        logger.error(f"Failed to start pipeline for job {job_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start audit: {str(e)}")
    
    return UploadResponse(job_id=job_id, message="Audit is running. You will see metrics on the dashboard shortly.")


@router.post("/{job_id}/retry", response_model=UploadResponse)
async def retry_job(job_id: str, current_user=Depends(require_user)) -> UploadResponse:
    """
    Retry a failed audit job.
    
    This endpoint:
    - Validates the job exists and belongs to the user
    - Resets job status to "queued"
    - Enqueues the job for background processing (returns immediately)
    
    Returns:
        Success message with job_id
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Customer ID not found in token")
    
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    
    if job.status not in ["failed", "completed"]:
        raise HTTPException(status_code=400, detail="Can only retry failed or completed jobs.")
    
    if not job.contracts:
        raise HTTPException(status_code=400, detail="Contracts missing.")
    if not job.billing_records:
        raise HTTPException(status_code=400, detail="Billing data missing.")
    
    # Reset job status and enqueue for background processing
    job_manager.set_job_status(job, "queued", "Retrying audit...")
    job_manager.update_progress(job_id, 0, "Queued for retry...")
    
    # Enqueue to Celery (returns immediately)
    job_manager.enqueue_job(job_id)
    
    return UploadResponse(job_id=job_id, message="Audit retry initiated. Processing will begin shortly.")


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
    """Get job status. Non-blocking with timeout."""
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Get job in async-safe way with timeout
        job = await asyncio.wait_for(
            asyncio.to_thread(
                job_manager.get_job,
                job_id,
                current_user.get("organization_id")
            ),
            timeout=5.0  # 5 second timeout
        )
    except asyncio.TimeoutError:
        logger.error(f"Job status lookup timed out for job {job_id}")
        raise HTTPException(status_code=504, detail="Status lookup timed out. Please try again.")
    except Exception as e:
        logger.error(f"Failed to get job status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get job status: {str(e)}")
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    
    job_status = JobStatus(
        job_id=job.id,
        created_at=job.created_at,
        status=job.status,
        message=job.message,
        stages=job.stages,
        metrics=job.metrics,
        progress=job.metrics.get("progress"),
        progress_message=job.metrics.get("progress_message"),
        vendor_name=job.vendor_name,
        user_type=getattr(job, 'user_type', 'customer'),
    )
    
    return job_status

