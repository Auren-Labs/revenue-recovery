import os
from pathlib import Path
import tempfile
from typing import List, Literal

from fastapi import UploadFile

from app.services import storage_supabase

# Temporary local storage for processing (files are also stored in Supabase)
UPLOAD_DIR = Path(tempfile.gettempdir()) / "contractguard_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _persist_locally_for_processing(files: List[UploadFile], job_id: str, category: str) -> List[Path]:
    """Store files locally temporarily for processing (Azure DI, etc.)."""
    job_dir = UPLOAD_DIR / job_id / category
    job_dir.mkdir(parents=True, exist_ok=True)
    saved_paths: List[Path] = []
    for file in files:
        target = job_dir / file.filename
        content = await file.read()
        await file.seek(0)  # Reset for later use
        target.write_bytes(content)
        saved_paths.append(target)
    return saved_paths


async def store_contracts(job_id: str, files: List[UploadFile]) -> List[dict]:
    """Store contract files in Supabase Storage and locally for processing."""
    # Read file contents
    file_data = []
    for file in files:
        content = await file.read()
        await file.seek(0)  # Reset for local storage
        file_data.append((file.filename, content))
    
    # Upload to Supabase Storage (primary storage)
    supabase_paths = await storage_supabase.upload_files(file_data, prefix=f"{job_id}/contracts")
    
    # Also store locally for processing (Azure DI needs local files)
    local_paths = await _persist_locally_for_processing(files, job_id, "contracts")
    
    # Build metadata
    metadata = []
    for idx, file in enumerate(files):
        metadata.append(
            {
                "filename": file.filename,
                "local_path": str(local_paths[idx]) if idx < len(local_paths) else None,
                "storage": "supabase",
                "storage_path": supabase_paths[idx] if idx < len(supabase_paths) else None,
            }
        )
    return metadata


async def store_billing(job_id: str, files: List[UploadFile]) -> List[dict]:
    """Store billing files in Supabase Storage and locally for processing."""
    # Read file contents
    file_data = []
    for file in files:
        content = await file.read()
        await file.seek(0)  # Reset for local storage
        file_data.append((file.filename, content))
    
    # Upload to Supabase Storage (primary storage)
    supabase_paths = await storage_supabase.upload_files(file_data, prefix=f"{job_id}/billing")
    
    # Also store locally for processing (openpyxl needs local files)
    local_paths = await _persist_locally_for_processing(files, job_id, "billing")
    
    # Build metadata
    metadata = []
    for idx, file in enumerate(files):
        metadata.append(
            {
                "filename": file.filename,
                "local_path": str(local_paths[idx]) if idx < len(local_paths) else None,
                "storage": "supabase",
                "storage_path": supabase_paths[idx] if idx < len(supabase_paths) else None,
            }
        )
    return metadata


