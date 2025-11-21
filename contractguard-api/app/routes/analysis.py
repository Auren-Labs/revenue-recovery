from fastapi import APIRouter, HTTPException

from app.schemas import AnalysisSummary, JobStatus
from app.services import job_manager

router = APIRouter()


@router.get("/{job_id}/summary", response_model=AnalysisSummary)
async def analysis_summary(job_id: str) -> AnalysisSummary:
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_status = JobStatus(
        job_id=job.id,
        created_at=job.created_at,
        status=job.status,
        message=job.message,
        stages=job.stages,
        metrics=job.metrics,
    )
    return AnalysisSummary(job=job_status, discrepancies=job.discrepancies)

