from __future__ import annotations

from app.workers.celery_app import celery_app
from app.services import job_manager, document_extraction, llm_extraction, reconciliation
from app.services.file_handler import retrieve_files_for_job


@celery_app.task(name="app.workers.tasks.process_job")
def process_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        return
    job_manager.run_pipeline_sync(job_id)


