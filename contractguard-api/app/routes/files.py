from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services import job_manager

router = APIRouter()


def _find_local_file(job_id: str, filename: str, category: str) -> Path | None:
    job = job_manager.get_job(job_id)
    if not job:
        return None

    entries = []
    if category == "contracts":
        entries = job.metrics.get("contract_files", []) if isinstance(job.metrics, dict) else []
        entries = entries or job.contracts
    elif category == "billing":
        entries = job.metrics.get("billing_files", []) if isinstance(job.metrics, dict) else []
        entries = entries or job.billing_records

    for entry in entries or []:
        if entry.get("filename") == filename:
            local_path = entry.get("local_path")
            if local_path:
                path = Path(local_path)
                if path.exists():
                    return path
    return None


@router.get("/jobs/{job_id}/contracts/{filename}")
def download_contract(job_id: str, filename: str):
    path = _find_local_file(job_id, filename, "contracts")
    if not path:
        raise HTTPException(status_code=404, detail="Contract file not found.")
    return FileResponse(path, filename=filename, media_type="application/pdf")

