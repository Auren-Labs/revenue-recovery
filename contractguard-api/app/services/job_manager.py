from __future__ import annotations

import asyncio
from datetime import datetime
from fastapi.concurrency import run_in_threadpool

from app.models import Job
from app.services import document_extraction, llm_extraction, reconciliation, job_repository

try:
    from app.workers.tasks import process_job as celery_task

    CELERY_AVAILABLE = True
except Exception:
    CELERY_AVAILABLE = False

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


def set_job_status(job: Job, status: str, message: str | None = None) -> None:
    job.status = status
    job.message = message
    job_repository.update_job_status(job.id, status, message)


async def simulate_latency(seconds: float = 1.0) -> None:
    await asyncio.sleep(seconds)


def enqueue_job(job_id: str):
    if CELERY_AVAILABLE:
        celery_task.delay(job_id)
    else:
        # fallback: run in background thread
        asyncio.create_task(run_pipeline_async(job_id))


async def run_pipeline_async(job_id: str):
    await run_in_threadpool(run_pipeline_sync, job_id)


def run_pipeline_sync(job_id: str):
    job = get_job(job_id)
    if not job:
        return
    try:
        set_job_status(job, "in_progress")
        update_stage(job, "upload", "completed", "Files stored and ready.")

        update_stage(job, "document_extraction", "in_progress")
        extraction = asyncio.run(document_extraction.run(job, job.contracts))
        update_stage(job, "document_extraction", "completed")
        job_repository.save_metrics(job.id, job.metrics)

        update_stage(job, "llm_extraction", "in_progress")
        llm_output = asyncio.run(llm_extraction.analyze(job, extraction["documents"]))
        update_stage(job, "llm_extraction", "completed")
        job_repository.save_metrics(job.id, job.metrics)

        update_stage(job, "reconciliation", "in_progress")
        asyncio.run(reconciliation.run(job, llm_output))
        update_stage(job, "reconciliation", "completed")
        job_repository.save_metrics(job.id, job.metrics)
        job_repository.replace_discrepancies(job.id, job.discrepancies)

        set_job_status(job, "completed", "Analysis finished.")
    except Exception as exc:
        set_job_status(job, "failed", str(exc))


