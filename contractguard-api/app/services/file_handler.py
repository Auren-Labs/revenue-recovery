import os
import asyncio
import logging
from pathlib import Path
import tempfile
from typing import List, Literal

from fastapi import UploadFile

from app.services import storage_supabase

logger = logging.getLogger(__name__)

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
    """Store contract files locally first (required for processing), then upload to Supabase in background."""
    logger.info(f"Storing {len(files)} contract file(s) for job {job_id}")
    
    try:
        # Read all file contents into memory first (needed for both local and Supabase)
        logger.info("Reading file contents...")
        file_data_list = []
        for file in files:
            content = await file.read()
            await file.seek(0)  # Reset for potential reuse
            file_data_list.append((file.filename, content))
        logger.info(f"Read {len(file_data_list)} file(s) into memory")
        
        # Store locally first (required for processing) - do this immediately
        logger.info("Storing files locally for processing...")
        job_dir = UPLOAD_DIR / job_id / "contracts"
        job_dir.mkdir(parents=True, exist_ok=True)
        local_paths = []
        for filename, content in file_data_list:
            target = job_dir / filename
            target.write_bytes(content)
            local_paths.append(target)
        logger.info(f"Stored {len(local_paths)} file(s) locally")
    
        # Build metadata with local paths (return immediately)
        metadata = []
        for idx, (filename, _) in enumerate(file_data_list):
            metadata.append(
                {
                    "filename": filename,
                    "local_path": str(local_paths[idx]) if idx < len(local_paths) else None,
                    "storage": "local",  # Default to local
                    "storage_path": None,
                }
            )
        
        # Start Supabase upload in background (fire and forget)
        # Don't wait for it - return immediately
        from app.config import get_settings
        settings = get_settings()
        if settings.supabase_url and settings.supabase_service_key and settings.supabase_storage_bucket:
            logger.info("Starting Supabase upload in background (non-blocking)...")
            # Create background task that won't block the response
            async def _upload_to_supabase_background():
                try:
                    # Upload with timeout (file_data_list already has content)
                    supabase_paths = await asyncio.wait_for(
                        storage_supabase.upload_files(file_data_list, prefix=f"{job_id}/contracts"),
                        timeout=120.0  # 2 minute timeout for all uploads
                    )
                    logger.info(f"Background upload complete: {len(supabase_paths)} file(s) to Supabase")
                    
                    # Update metadata in database (optional, non-critical)
                    try:
                        from app.services import job_manager, job_repository
                        job = job_repository.load_job(job_id)
                        if job:
                            # Update metadata with Supabase paths (only update, don't duplicate)
                            updated_metadata = []
                            for idx, supabase_path in enumerate(supabase_paths):
                                if supabase_path and not supabase_path.startswith("failed-") and idx < len(metadata):
                                    updated_metadata.append({
                                        "filename": metadata[idx]["filename"],
                                        "storage": "supabase",
                                        "storage_path": supabase_path,
                                        "local_path": metadata[idx].get("local_path"),
                                    })
                            # Update existing entries (attach_contracts will deduplicate)
                            if updated_metadata:
                                job_manager.attach_contracts(job, updated_metadata)
                                logger.info("Updated job metadata with Supabase paths")
                    except Exception as e:
                        logger.warning(f"Failed to update metadata with Supabase paths (non-critical): {e}")
                except asyncio.TimeoutError:
                    logger.warning("Background Supabase upload timed out")
                except Exception as e:
                    logger.error(f"Background Supabase upload failed: {e}")
            
            # Start background task (don't await)
            asyncio.create_task(_upload_to_supabase_background())
        else:
            logger.info("Supabase not configured, using local storage only")
        
        logger.info(f"Successfully stored {len(metadata)} contract file(s) locally for job {job_id} (Supabase upload in background)")
        return metadata
    except Exception as e:
        logger.error(f"Failed to store contract files for job {job_id}: {e}", exc_info=True)
        raise


async def store_billing(job_id: str, files: List[UploadFile]) -> List[dict]:
    """Store billing files locally first (required for processing), then upload to Supabase in background."""
    logger.info(f"Storing {len(files)} billing file(s) for job {job_id}")
    
    try:
        # Read all file contents into memory first (needed for both local and Supabase)
        logger.info("Reading file contents...")
        file_data_list = []
        for file in files:
            content = await file.read()
            await file.seek(0)  # Reset for potential reuse
            file_data_list.append((file.filename, content))
        logger.info(f"Read {len(file_data_list)} file(s) into memory")
        
        # Store locally first (required for processing) - do this immediately
        logger.info("Storing files locally for processing...")
        job_dir = UPLOAD_DIR / job_id / "billing"
        job_dir.mkdir(parents=True, exist_ok=True)
        local_paths = []
        for filename, content in file_data_list:
            target = job_dir / filename
            target.write_bytes(content)
            local_paths.append(target)
        logger.info(f"Stored {len(local_paths)} file(s) locally")
    
        # Build metadata with local paths (return immediately)
        metadata = []
        for idx, (filename, _) in enumerate(file_data_list):
            metadata.append(
                {
                    "filename": filename,
                    "local_path": str(local_paths[idx]) if idx < len(local_paths) else None,
                    "storage": "local",  # Default to local
                    "storage_path": None,
                }
            )
        
        # Start Supabase upload in background (fire and forget)
        # Don't wait for it - return immediately
        from app.config import get_settings
        settings = get_settings()
        if settings.supabase_url and settings.supabase_service_key and settings.supabase_storage_bucket:
            logger.info("Starting Supabase upload in background (non-blocking)...")
            # Create background task that won't block the response
            async def _upload_to_supabase_background():
                try:
                    # Upload with timeout (file_data_list already has content)
                    supabase_paths = await asyncio.wait_for(
                        storage_supabase.upload_files(file_data_list, prefix=f"{job_id}/billing"),
                        timeout=120.0  # 2 minute timeout for all uploads
                    )
                    logger.info(f"Background upload complete: {len(supabase_paths)} file(s) to Supabase")
                    
                    # Update metadata in database (optional, non-critical)
                    try:
                        from app.services import job_manager, job_repository
                        job = job_repository.load_job(job_id)
                        if job:
                            # Update metadata with Supabase paths (only update, don't duplicate)
                            updated_metadata = []
                            for idx, supabase_path in enumerate(supabase_paths):
                                if supabase_path and not supabase_path.startswith("failed-") and idx < len(metadata):
                                    updated_metadata.append({
                                        "filename": metadata[idx]["filename"],
                                        "storage": "supabase",
                                        "storage_path": supabase_path,
                                        "local_path": metadata[idx].get("local_path"),
                                    })
                            # Update existing entries (attach_billing will deduplicate)
                            if updated_metadata:
                                job_manager.attach_billing(job, updated_metadata)
                                logger.info("Updated job metadata with Supabase paths")
                    except Exception as e:
                        logger.warning(f"Failed to update metadata with Supabase paths (non-critical): {e}")
                except asyncio.TimeoutError:
                    logger.warning("Background Supabase upload timed out")
                except Exception as e:
                    logger.error(f"Background Supabase upload failed: {e}")
            
            # Start background task (don't await)
            asyncio.create_task(_upload_to_supabase_background())
        else:
            logger.info("Supabase not configured, using local storage only")
        
        logger.info(f"Successfully stored {len(metadata)} billing file(s) locally for job {job_id} (Supabase upload in background)")
        return metadata
    except Exception as e:
        logger.error(f"Failed to store billing files for job {job_id}: {e}", exc_info=True)
        raise


