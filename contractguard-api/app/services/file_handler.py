import os
from pathlib import Path
import tempfile
from typing import List, Literal

from fastapi import UploadFile

from app.services import storage_azure

UPLOAD_DIR = Path(tempfile.gettempdir()) / "contractguard_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _persist_locally(files: List[UploadFile], job_id: str, category: str) -> List[Path]:
    job_dir = UPLOAD_DIR / job_id / category
    job_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: List[Path] = []
    for file in files:
        target = job_dir / file.filename
        content = await file.read()
        target.write_bytes(content)
        saved_paths.append(target)
    return saved_paths


async def store_contracts(job_id: str, files: List[UploadFile]) -> List[dict]:
    local_paths = await _persist_locally(files, job_id, "contracts")
    memory_files = [(path.name, path.read_bytes()) for path in local_paths]
    remote_paths = await storage_azure.upload_files(memory_files, prefix=f"{job_id}/contracts")
    metadata = []
    for idx, path_obj in enumerate(local_paths):
        remote = remote_paths[idx] if remote_paths and idx < len(remote_paths) else str(path_obj)
        metadata.append(
            {
                "filename": path_obj.name,
                "local_path": str(path_obj),
                "storage": "azure" if remote_paths else "local",
                "storage_path": remote,
            }
        )
    return metadata


async def store_billing(job_id: str, files: List[UploadFile]) -> List[dict]:
    local_paths = await _persist_locally(files, job_id, "billing")
    memory_files = [(path.name, path.read_bytes()) for path in local_paths]
    remote_paths = await storage_azure.upload_files(memory_files, prefix=f"{job_id}/billing")
    metadata = []
    for idx, path_obj in enumerate(local_paths):
        remote = remote_paths[idx] if remote_paths and idx < len(remote_paths) else str(path_obj)
        metadata.append(
            {
                "filename": path_obj.name,
                "local_path": str(path_obj),
                "storage": "azure" if remote_paths else "local",
                "storage_path": remote,
            }
        )
    return metadata


