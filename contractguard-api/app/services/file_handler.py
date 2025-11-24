import os
import asyncio
from pathlib import Path
import tempfile
from typing import List, Literal

from fastapi import UploadFile

from app.services import storage_supabase

# Temporary local storage for processing (files are also stored in Supabase)
UPLOAD_DIR = Path(tempfile.gettempdir()) / "contractguard_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _persist_single_file(file: UploadFile, job_dir: Path) -> Path:
    """Store a single file locally for processing."""
    target = job_dir / file.filename
    content = await file.read()
    await file.seek(0)  # Reset for later use
    target.write_bytes(content)
    return target

async def _persist_locally_for_processing(files: List[UploadFile], job_id: str, category: str) -> List[Path]:
    """Store files locally temporarily for processing (Azure DI, etc.) in parallel."""
    job_dir = UPLOAD_DIR / job_id / category
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Process all files in parallel
    tasks = [_persist_single_file(file, job_dir) for file in files]
    saved_paths = await asyncio.gather(*tasks)
    return list(saved_paths)


async def _read_file_content(file: UploadFile) -> tuple[str, bytes]:
    """Read a single file's content."""
    content = await file.read()
    await file.seek(0)  # Reset for later use
    return (file.filename, content)

async def store_contracts(job_id: str, files: List[UploadFile]) -> List[dict]:
    """Store contract files in Supabase Storage and locally for processing in parallel."""
    # Read all file contents in parallel
    read_tasks = [_read_file_content(file) for file in files]
    file_data = await asyncio.gather(*read_tasks)
    
    # Upload to Supabase Storage and store locally in parallel
    supabase_task = storage_supabase.upload_files(file_data, prefix=f"{job_id}/contracts")
    local_task = _persist_locally_for_processing(files, job_id, "contracts")
    
    supabase_paths, local_paths = await asyncio.gather(supabase_task, local_task)
    
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
    """Store billing files in Supabase Storage and locally for processing in parallel."""
    # Read all file contents in parallel
    read_tasks = [_read_file_content(file) for file in files]
    file_data = await asyncio.gather(*read_tasks)
    
    # Upload to Supabase Storage and store locally in parallel
    supabase_task = storage_supabase.upload_files(file_data, prefix=f"{job_id}/billing")
    local_task = _persist_locally_for_processing(files, job_id, "billing")
    
    supabase_paths, local_paths = await asyncio.gather(supabase_task, local_task)
    
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


