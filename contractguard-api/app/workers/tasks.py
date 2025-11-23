"""
Celery background tasks for processing audit jobs.
"""
from __future__ import annotations

import logging
from typing import Dict, Any

from celery import Task

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# NOTE: job_manager is imported inside functions to avoid circular import
# This is safe because Celery tasks run in separate processes


class AuditJobTask(Task):
    """Custom task class for audit job processing with retry logic."""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Called when task fails after all retries."""
        job_id = args[0] if args else None
        if job_id:
            try:
                # Import here to avoid circular dependency
                from app.services import job_manager
                
                job = job_manager.get_job(job_id)
                if job:
                    job_manager.set_job_status(job, "failed", f"Job failed after retries: {str(exc)}")
                    job_manager._send_failure_email(job, str(exc))
            except Exception as e:
                logger.error("Failed to update job status on failure: %s", e)


@celery_app.task(
    name="app.workers.tasks.process_audit_job",
    bind=True,
    base=AuditJobTask,
    max_retries=3,
    default_retry_delay=60,  # 1 minute initial delay
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,  # Max 10 minutes between retries
    retry_jitter=True,  # Add randomness to retry delays
)
def process_audit_job(self: Task, job_id: str) -> Dict[str, Any]:
    """
    Background task to process an audit job.
    
    This task:
    - Runs asynchronously in a Celery worker
    - Automatically retries on failure (up to 3 times)
    - Updates job progress and status
    - Sends email notifications on completion/failure
    
    Args:
        job_id: The ID of the job to process
        
    Returns:
        Dict with job status and results
        
    Raises:
        Retry: If the task should be retried
        Exception: If the task fails after all retries
    """
    logger.info("Starting audit job processing: %s (attempt %d)", job_id, self.request.retries + 1)
    
    try:
        # Import here to avoid circular dependency
        from app.services import job_manager
        
        # Load job from database
        job = job_manager.get_job(job_id)
        if not job:
            logger.error("Job %s not found", job_id)
            return {"status": "failed", "error": "Job not found"}
        
        # Check if job is already completed or in progress
        if job.status == "completed":
            logger.info("Job %s is already completed", job_id)
            return {"status": "completed", "job_id": job_id}
        
        if job.status == "in_progress" and self.request.retries == 0:
            logger.warning("Job %s is already in progress", job_id)
            # Don't retry if already in progress (might be duplicate task)
            return {"status": "in_progress", "job_id": job_id}
        
        # Run the pipeline synchronously (it handles async internally)
        # This will:
        # 1. Extract documents
        # 2. Run LLM extraction
        # 3. Reconcile billing
        # 4. Update progress and status
        # 5. Send email notifications
        job_manager.run_pipeline_sync(job_id)
        
        # Reload job to get final status
        job = job_manager.get_job(job_id)
        if not job:
            logger.error("Job %s not found after processing", job_id)
            return {"status": "error", "error": "Job not found after processing"}
        
        if job.status == "completed":
            logger.info("Job %s completed successfully", job_id)
            return {
                "status": "completed",
                "job_id": job_id,
                "recoverable_amount": job.metrics.get("recoverable_amount", 0),
                "discrepancy_count": len(job.discrepancies),
            }
        elif job.status == "failed":
            error_msg = job.message or "Unknown error"
            logger.error("Job %s failed: %s", job_id, error_msg)
            # Raise exception to trigger retry
            raise Exception(error_msg)
        else:
            logger.warning("Job %s in unexpected status: %s", job_id, job.status)
            return {"status": job.status, "job_id": job_id}
            
    except Exception as exc:
        logger.exception("Job %s processing failed: %s", job_id, exc)
        
        # Update job status to failed (temporarily)
        try:
            # Import here to avoid circular dependency (already imported above, but safe to re-import)
            from app.services import job_manager
            
            job = job_manager.get_job(job_id)
            if job:
                job_manager.set_job_status(job, "failed", f"Processing error: {str(exc)}")
        except Exception as e:
            logger.error("Failed to update job status: %s", e)
        
        # Retry with exponential backoff
        # Retry count: 0, 1, 2 (3 attempts total)
        # Delays: 60s, 120s, 240s (with jitter)
        retry_delay = 60 * (2 ** self.request.retries)
        
        if self.request.retries < self.max_retries:
            logger.info(
                "Retrying job %s in %ds (attempt %d/%d)",
                job_id,
                retry_delay,
                self.request.retries + 2,
                self.max_retries + 1
            )
            raise self.retry(exc=exc, countdown=retry_delay)
        else:
            # All retries exhausted
            logger.error("Job %s failed after %d attempts", job_id, self.max_retries + 1)
            # Send failure email
            try:
                # Import here to avoid circular dependency
                from app.services import job_manager
                
                job = job_manager.get_job(job_id)
                if job:
                    job_manager._send_failure_email(job, f"Job failed after {self.max_retries + 1} attempts: {str(exc)}")
            except Exception as e:
                logger.error("Failed to send failure email: %s", e)
            
            raise exc


