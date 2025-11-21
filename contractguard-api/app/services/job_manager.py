from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Dict, List
from uuid import uuid4

from fastapi.concurrency import run_in_threadpool

from app.models import Job
from app.services import document_extraction, llm_extraction, reconciliation

try:
    from app.workers.tasks import process_job as celery_task

    CELERY_AVAILABLE = True
except Exception:
    CELERY_AVAILABLE = False

_JOBS: Dict[str, Job] = {}


def create_job(vendor_name: str) -> Job:
    job_id = str(uuid4())
    job = Job(id=job_id, vendor_name=vendor_name)
    _JOBS[job_id] = job
    return job


def get_job(job_id: str) -> Job | None:
    return _JOBS.get(job_id)


def list_jobs() -> List[Job]:
    return list(_JOBS.values())


def attach_contracts(job: Job, documents: List[Dict]) -> None:
    job.contracts.extend(documents)
    stored = job.metrics.setdefault("contract_files", [])
    for doc in documents:
        stored.append(
            {
                "filename": doc.get("filename"),
                "storage": doc.get("storage"),
                "storage_path": doc.get("storage_path"),
                "local_path": doc.get("local_path"),
            }
        )


def attach_billing(job: Job, documents: List[Dict]) -> None:
    job.billing_records.extend(documents)
    stored = job.metrics.setdefault("billing_files", [])
    for doc in documents:
        stored.append(
            {
                "filename": doc.get("filename"),
                "storage": doc.get("storage"),
                "storage_path": doc.get("storage_path"),
                "local_path": doc.get("local_path"),
            }
        )


def update_stage(job: Job, stage_name: str, status: str, detail: str | None = None) -> None:
    for stage in job.stages:
        if stage["name"] == stage_name:
            stage["status"] = status
            if detail:
                stage["detail"] = detail
            if status == "completed":
                stage["completed_at"] = datetime.utcnow().isoformat()
            break


def set_job_status(job: Job, status: str, message: str | None = None) -> None:
    job.status = status
    job.message = message


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

        update_stage(job, "llm_extraction", "in_progress")
        llm_output = asyncio.run(llm_extraction.analyze(job, extraction["documents"]))
        update_stage(job, "llm_extraction", "completed")

        update_stage(job, "reconciliation", "in_progress")
        asyncio.run(reconciliation.run(job, llm_output))
        update_stage(job, "reconciliation", "completed")

        set_job_status(job, "completed", "Analysis finished.")
    except Exception as exc:
        set_job_status(job, "failed", str(exc))


