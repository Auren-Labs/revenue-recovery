from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from fastapi.concurrency import run_in_threadpool

from app.models import Job
from app.services import document_extraction, llm_extraction, reconciliation, job_repository
from app.services.email_service import get_email_service
from app.services.auth import get_auth_service
from app.config import get_settings

logger = logging.getLogger(__name__)

# Lazy import to avoid circular dependency
CELERY_AVAILABLE = False
process_audit_job = None

def _check_celery_available():
    """Check if Celery is available and import the task."""
    global CELERY_AVAILABLE, process_audit_job
    if CELERY_AVAILABLE and process_audit_job is not None:
        return True
    
    try:
        from app.workers.tasks import process_audit_job as task
        process_audit_job = task
        CELERY_AVAILABLE = True
        return True
    except Exception as e:
        logger.warning("Celery not available: %s", e)
        CELERY_AVAILABLE = False
        process_audit_job = None
        return False

def create_job(vendor_name: str, organization_id: str | None) -> Job:
    return job_repository.create_job_record(vendor_name, organization_id)


def get_job(job_id: str, organization_id: str | None = None) -> Job | None:
    return job_repository.load_job(job_id, organization_id)


def attach_contracts(job: Job, documents: list[dict]) -> None:
    job.contracts.extend(documents)
    stored = job.metrics.setdefault("contract_files", [])
    stored.extend(
        {
            "filename": doc.get("filename"),
            "storage": doc.get("storage"),
            "storage_path": doc.get("storage_path"),
            "local_path": doc.get("local_path"),
        }
        for doc in documents
    )
    job_repository.replace_contract_files(job.id, job.contracts)
    job_repository.save_metrics(job.id, job.metrics)


def attach_billing(job: Job, documents: list[dict]) -> None:
    job.billing_records.extend(documents)
    stored = job.metrics.setdefault("billing_files", [])
    stored.extend(
        {
            "filename": doc.get("filename"),
            "storage": doc.get("storage"),
            "storage_path": doc.get("storage_path"),
            "local_path": doc.get("local_path"),
        }
        for doc in documents
    )
    job_repository.replace_billing_files(job.id, job.billing_records)
    job_repository.save_metrics(job.id, job.metrics)


def update_stage(job: Job, stage_name: str, status: str, detail: str | None = None) -> None:
    for stage in job.stages:
        if stage["name"] == stage_name:
            stage["status"] = status
            if detail:
                stage["detail"] = detail
            if status == "completed":
                stage["completed_at"] = datetime.utcnow().isoformat()
            break
    job_repository.update_stage(job.id, stage_name, status, detail)


def _send_completion_email(job: Job) -> None:
    """Send email notification when audit completes."""
    try:
        if not job.customer_id:
            return
        
        email_service = get_email_service()
        auth_service = get_auth_service()
        
        # Get first active user from customer
        response = auth_service.supabase.table("users").select("email, full_name").eq(
            "customer_id", job.customer_id
        ).eq("is_active", True).limit(1).execute()
        
        if not response.data:
            logger.warning(f"No active users found for customer {job.customer_id}")
            return
        
        user_data = response.data[0]
        user_email = user_data.get("email")
        user_name = user_data.get("full_name", "User")
        
        recoverable_amount = job.metrics.get("recoverable_amount", 0)
        discrepancy_count = len(job.discrepancies)
        
        settings = get_settings()
        dashboard_url = f"{settings.frontend_url}/dashboard?job={job.id}"
        
        email_service.send_audit_complete_notification(
            user_email=user_email,
            user_name=user_name,
            vendor_name=job.vendor_name,
            job_id=job.id,
            recoverable_amount=recoverable_amount,
            discrepancy_count=discrepancy_count,
            dashboard_url=dashboard_url,
        )
    except Exception as e:
        logger.error(f"Failed to send completion email: {e}")


def _send_failure_email(job: Job, error_message: str) -> None:
    """Send email notification when audit fails."""
    try:
        if not job.customer_id:
            return
        
        email_service = get_email_service()
        auth_service = get_auth_service()
        
        # Get first active user from customer
        response = auth_service.supabase.table("users").select("email, full_name").eq(
            "customer_id", job.customer_id
        ).eq("is_active", True).limit(1).execute()
        
        if not response.data:
            logger.warning(f"No active users found for customer {job.customer_id}")
            return
        
        user_data = response.data[0]
        user_email = user_data.get("email")
        user_name = user_data.get("full_name", "User")
        
        settings = get_settings()
        dashboard_url = f"{settings.frontend_url}/dashboard?job={job.id}"
        
        email_service.send_audit_failed_notification(
            user_email=user_email,
            user_name=user_name,
            vendor_name=job.vendor_name,
            job_id=job.id,
            error_message=error_message,
            dashboard_url=dashboard_url,
        )
    except Exception as e:
        logger.error(f"Failed to send failure email: {e}")


def update_progress(job_id: str, progress: int, message: str | None = None) -> None:
    """Update job progress percentage (0-100) and optional message."""
    job = get_job(job_id)
    if not job:
        return
    
    job.metrics["progress"] = max(0, min(100, progress))
    if message:
        job.metrics["progress_message"] = message
    job_repository.save_metrics(job.id, job.metrics)


def set_job_status(job: Job, status: str, message: str | None = None) -> None:
    job.status = status
    job.message = message
    job_repository.update_job_status(job.id, status, message)


async def simulate_latency(seconds: float = 1.0) -> None:
    await asyncio.sleep(seconds)


def enqueue_job(job_id: str) -> None:
    """
    Enqueue a job for background processing.
    
    Uses Celery if available, otherwise falls back to async thread.
    This function returns immediately - the job is processed in the background.
    
    Args:
        job_id: The ID of the job to process
    """
    # Lazy import to avoid circular dependency
    if _check_celery_available() and process_audit_job:
        try:
            # Enqueue to Celery (returns immediately)
            process_audit_job.delay(job_id)
            logger.info("Job %s enqueued to Celery for background processing", job_id)
        except Exception as e:
            logger.error("Failed to enqueue job %s to Celery: %s", job_id, e, exc_info=True)
            # Fallback to async thread
            logger.warning("Falling back to async thread processing for job %s", job_id)
            asyncio.create_task(run_pipeline_async(job_id))
    else:
        # Fallback: run in background thread (not recommended for production)
        logger.warning("Celery not available, using async thread fallback for job %s", job_id)
        asyncio.create_task(run_pipeline_async(job_id))


async def run_pipeline_async(job_id: str):
    await run_in_threadpool(run_pipeline_sync, job_id)


def run_pipeline_sync(job_id: str):
    job = get_job(job_id)
    if not job:
        return
    try:
        set_job_status(job, "in_progress")
        update_progress(job_id, 5, "Starting audit pipeline...")
        update_stage(job, "upload", "completed", "Files stored and ready.")

        update_stage(job, "document_extraction", "in_progress")
        update_progress(job_id, 15, "Extracting contract clauses and terms...")
        extraction = asyncio.run(document_extraction.run(job, job.contracts))
        update_stage(job, "document_extraction", "completed")
        update_progress(job_id, 40, f"Extracted {extraction.get('clauses', 0)} clauses from {len(extraction.get('documents', []))} documents")
        job_repository.save_metrics(job.id, job.metrics)

        update_stage(job, "llm_extraction", "in_progress")
        update_progress(job_id, 50, "Analyzing contract terms with AI...")
        llm_output = asyncio.run(llm_extraction.analyze(job, extraction["documents"]))
        update_stage(job, "llm_extraction", "completed")
        update_progress(job_id, 70, "Contract analysis complete")
        job_repository.save_metrics(job.id, job.metrics)

        update_stage(job, "reconciliation", "in_progress")
        update_progress(job_id, 75, "Reconciling billing data with contract terms...")
        asyncio.run(reconciliation.run(job, llm_output))
        update_stage(job, "reconciliation", "completed")
        update_progress(job_id, 95, "Reconciliation complete, finalizing results...")
        job_repository.save_metrics(job.id, job.metrics)
        job_repository.replace_discrepancies(job.id, job.discrepancies)

        update_progress(job_id, 100, "Audit complete!")
        set_job_status(job, "completed", "Analysis finished.")
        
        # Send email notification
        _send_completion_email(job)
    except Exception as exc:
        update_progress(job_id, 0, f"Error: {str(exc)}")
        set_job_status(job, "failed", str(exc))
        
        # Send failure email notification
        _send_failure_email(job, str(exc))


