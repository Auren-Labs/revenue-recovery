from __future__ import annotations

import asyncio
import logging
from datetime import datetime

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
    # Deduplicate by filename before adding
    existing_filenames = {doc.get("filename") for doc in job.contracts if doc.get("filename")}
    new_docs = [doc for doc in documents if doc.get("filename") not in existing_filenames]
    
    if new_docs:
        job.contracts.extend(new_docs)
    
    # Update or add to contract_files in metrics (deduplicate by filename)
    stored = job.metrics.setdefault("contract_files", [])
    
    for doc in documents:
        filename = doc.get("filename")
        if not filename:
            continue
        # Find existing entry or create new one
        existing = next((f for f in stored if f.get("filename") == filename), None)
        if existing:
            # Update existing entry (prefer supabase if available)
            if doc.get("storage") == "supabase" and doc.get("storage_path"):
                existing["storage"] = "supabase"
                existing["storage_path"] = doc.get("storage_path")
            if doc.get("local_path") and not existing.get("local_path"):
                existing["local_path"] = doc.get("local_path")
        else:
            # Add new entry
            stored.append({
                "filename": filename,
                "storage": doc.get("storage"),
                "storage_path": doc.get("storage_path"),
                "local_path": doc.get("local_path"),
            })
    
    job_repository.replace_contract_files(job.id, job.contracts)
    job_repository.save_metrics(job.id, job.metrics)


def attach_billing(job: Job, documents: list[dict]) -> None:
    # Deduplicate by filename before adding
    existing_filenames = {doc.get("filename") for doc in job.billing_records if doc.get("filename")}
    new_docs = [doc for doc in documents if doc.get("filename") not in existing_filenames]
    
    if new_docs:
        job.billing_records.extend(new_docs)
    
    # Update or add to billing_files in metrics (deduplicate by filename)
    stored = job.metrics.setdefault("billing_files", [])
    
    for doc in documents:
        filename = doc.get("filename")
        if not filename:
            continue
        # Find existing entry or create new one
        existing = next((f for f in stored if f.get("filename") == filename), None)
        if existing:
            # Update existing entry (prefer supabase if available)
            if doc.get("storage") == "supabase" and doc.get("storage_path"):
                existing["storage"] = "supabase"
                existing["storage_path"] = doc.get("storage_path")
            if doc.get("local_path") and not existing.get("local_path"):
                existing["local_path"] = doc.get("local_path")
        else:
            # Add new entry
            stored.append({
                "filename": filename,
                "storage": doc.get("storage"),
                "storage_path": doc.get("storage_path"),
                "local_path": doc.get("local_path"),
            })
    
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
            _start_async_pipeline(job_id)
    else:
        # Fallback: run in background thread (not recommended for production)
        logger.warning("Celery not available, using async thread fallback for job %s", job_id)
        _start_async_pipeline(job_id)


def _start_async_pipeline(job_id: str) -> None:
    """Start the async pipeline in a background task."""
    import threading
    
    def run_in_thread():
        """Run the async pipeline in a new event loop."""
        try:
            logger.info("Starting async pipeline for job %s in background thread", job_id)
            asyncio.run(run_pipeline_async(job_id))
            logger.info("Async pipeline completed for job %s", job_id)
        except Exception as e:
            logger.error("Error in async pipeline for job %s: %s", job_id, e, exc_info=True)
            # Try to update job status to failed
            try:
                job = get_job(job_id)
                if job:
                    set_job_status(job, "failed", f"Pipeline error: {str(e)}")
            except Exception as update_error:
                logger.error("Failed to update job status after error: %s", update_error)
    
    # Always start in a background thread to avoid event loop conflicts
    thread = threading.Thread(target=run_in_thread, daemon=False, name=f"pipeline-{job_id}")
    thread.start()
    logger.info("Started async pipeline in background thread for job %s (thread: %s)", job_id, thread.name)


async def run_pipeline_async(job_id: str):
    """Run the audit pipeline asynchronously."""
    logger.info("=== Starting pipeline for job %s ===", job_id)
    try:
        job = get_job(job_id)
        if not job:
            logger.error("Job %s not found", job_id)
            return
        
        logger.info("Job %s loaded: vendor=%s, contracts=%d, billing=%d", 
                   job_id, job.vendor_name, len(job.contracts), len(job.billing_records))
        
        # Set status to in_progress immediately
        set_job_status(job, "in_progress")
        logger.info("Job %s status set to in_progress", job_id)
        update_progress(job_id, 5, "Starting audit pipeline...")
        update_stage(job, "upload", "completed", "Files stored and ready.")

        update_stage(job, "document_extraction", "in_progress")
        update_progress(job_id, 15, "Extracting contract clauses and terms...")
        logger.info(f"Starting document extraction for job {job_id}")
        
        # 🔥 DEDUPLICATE contracts by filename before extraction
        # (same file might appear with different storage paths - local vs supabase)
        seen_contract_filenames = set()
        unique_contracts = []
        for contract in job.contracts:
            filename = contract.get("filename", "")
            if filename and filename not in seen_contract_filenames:
                unique_contracts.append(contract)
                seen_contract_filenames.add(filename)
            elif not filename:
                unique_contracts.append(contract)  # Include contracts without filename
        
        logger.info(f"Processing {len(unique_contracts)} unique contract(s) (deduplicated from {len(job.contracts)})")
        extraction = await document_extraction.run(job, unique_contracts)
        logger.info(f"Document extraction complete for job {job_id}: {extraction.get('clauses', 0)} clauses")
        update_stage(job, "document_extraction", "completed")
        update_progress(job_id, 40, f"Extracted {extraction.get('clauses', 0)} clauses from {len(extraction.get('documents', []))} documents")
        job_repository.save_metrics(job.id, job.metrics)

        update_stage(job, "llm_extraction", "in_progress")
        update_progress(job_id, 50, "Analyzing contract terms with AI...")
        logger.info(f"Starting LLM extraction for job {job_id}")
        llm_output = await llm_extraction.analyze(job, extraction["documents"])
        logger.info(f"LLM extraction complete for job {job_id}")
        update_stage(job, "llm_extraction", "completed")
        update_progress(job_id, 70, "Contract analysis complete")
        job_repository.save_metrics(job.id, job.metrics)

        update_stage(job, "reconciliation", "in_progress")
        update_progress(job_id, 75, "Reconciling billing data with contract terms...")
        logger.info(f"Starting reconciliation for job {job_id}")
        await reconciliation.run(job, llm_output)
        logger.info(f"Reconciliation complete for job {job_id}")
        update_stage(job, "reconciliation", "completed")
        update_progress(job_id, 95, "Reconciliation complete, finalizing results...")
        job_repository.save_metrics(job.id, job.metrics)
        job_repository.replace_discrepancies(job.id, job.discrepancies)

        update_progress(job_id, 100, "Audit complete!")
        set_job_status(job, "completed", "Analysis finished.")
        logger.info(f"Job {job_id} completed successfully")
        
        # Send email notification
        _send_completion_email(job)
    except Exception as exc:
        logger.error(f"Job {job_id} failed: {exc}", exc_info=True)
        update_progress(job_id, 0, f"Error: {str(exc)}")
        set_job_status(job, "failed", str(exc))
        
        # Send failure email notification
        _send_failure_email(job, str(exc))


def run_pipeline_sync(job_id: str):
    """Synchronous wrapper for Celery compatibility."""
    # This is only used by Celery workers which run in separate processes
    # Use asyncio.run() here since we're in a fresh process
    try:
        asyncio.run(run_pipeline_async(job_id))
    except RuntimeError as e:
        # If there's already an event loop running, use a different approach
        if "asyncio.run() cannot be called from a running event loop" in str(e):
            logger.warning(f"Event loop already running for job {job_id}, using create_task")
            loop = asyncio.get_event_loop()
            loop.run_until_complete(run_pipeline_async(job_id))
        else:
            raise


