from __future__ import annotations

import inspect
import logging
import sys
import asyncio
from pathlib import Path
import tempfile
from typing import List
from uuid import uuid4

import httpx

logger = logging.getLogger(__name__)

# Patch GoTrue's SyncClient BEFORE importing supabase (it imports gotrue lazily).
_SyncClientCompat = None

try:
    from gotrue import http_clients as gotrue_http_clients
except ImportError:
    gotrue_http_clients = None
else:
    if "proxy" not in inspect.signature(httpx.Client.__init__).parameters:
        class _SyncClientCompat(httpx.Client):
            def __init__(self, *args, proxy=None, **kwargs):
                if proxy is not None and "proxies" not in kwargs:
                    kwargs["proxies"] = proxy
                super().__init__(*args, **kwargs)

            def aclose(self) -> None:
                self.close()

        gotrue_http_clients.SyncClient = _SyncClientCompat

        # Also patch any already-imported modules that grabbed SyncClient directly.
        for module_name, module in list(sys.modules.items()):
            if module_name and module_name.startswith("gotrue") and hasattr(module, "SyncClient"):
                setattr(module, "SyncClient", _SyncClientCompat)

from supabase import create_client, Client

from app.config import get_settings

settings = get_settings()

_supabase_client: Client | None = None


def get_client() -> Client | None:
    """Get Supabase client, creating it if needed. Non-blocking with error handling."""
    global _supabase_client
    if _supabase_client:
        return _supabase_client
    
    if not settings.supabase_url or not settings.supabase_service_key:
        logger.debug("Supabase not configured (missing URL or service key)")
        return None
    
    try:
        # Create client with timeout protection
        logger.debug("Initializing Supabase client...")
        _supabase_client = create_client(settings.supabase_url, settings.supabase_service_key)
        logger.debug("Supabase client initialized successfully")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        # Don't cache failed client
        _supabase_client = None
        return None


async def _upload_single_file(client: Client, bucket: str, filename: str, data: bytes, prefix: str) -> str:
    """Upload a single file to Supabase Storage."""
    path = f"{prefix}/{uuid4()}-{filename}"
    try:
        # Add timeout to prevent hanging
        await asyncio.wait_for(
            asyncio.to_thread(
                client.storage.from_(bucket).upload,
                path,
                data,
                {"contentType": "application/octet-stream"},
            ),
            timeout=60.0  # 60 second timeout per file
        )
        logger.info(f"Successfully uploaded {filename} to {path}")
        return path
    except asyncio.TimeoutError:
        logger.error(f"Timeout uploading {filename} to Supabase Storage")
        raise Exception(f"Upload timeout for {filename}")
    except Exception as e:
        logger.error(f"Failed to upload {filename} to Supabase Storage: {e}")
        raise

async def _store_local_fallback(files: List[tuple[str, bytes]], prefix: str) -> List[str]:
    """Store files locally when Supabase is not available."""
    local_dir = Path(tempfile.gettempdir()) / "contractguard_supabase"
    local_dir.mkdir(parents=True, exist_ok=True)
    stored_paths = []
    for filename, data in files:
        safe_prefix = prefix.replace("/", "_")
        target = local_dir / f"{safe_prefix}-{uuid4()}-{filename}"
        if not target.parent.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        stored_paths.append(str(target))
    return stored_paths

async def upload_files(files: List[tuple[str, bytes]], prefix: str) -> List[str]:
    """
    Uploads files to Supabase Storage in parallel.
    :param files: list of tuples (filename, bytes)
    :param prefix: folder path within the bucket
    :return: list of public paths
    """
    # Get client in async-safe way
    try:
        client = await asyncio.to_thread(get_client)
    except Exception as e:
        logger.error(f"Failed to get Supabase client: {e}")
        client = None
    
    bucket = settings.supabase_storage_bucket
    if not client or not bucket:
        logger.warning("Supabase client or bucket not configured, using local fallback")
        return await _store_local_fallback(files, prefix)

    logger.info(f"Uploading {len(files)} file(s) to Supabase Storage bucket '{bucket}' with prefix '{prefix}'")
    
    # Upload all files in parallel with error handling
    upload_tasks = [
        _upload_single_file(client, bucket, filename, data, prefix)
        for filename, data in files
    ]
    
    try:
        stored_paths = await asyncio.gather(*upload_tasks, return_exceptions=True)
        
        # Check for exceptions
        results = []
        for idx, result in enumerate(stored_paths):
            if isinstance(result, Exception):
                logger.error(f"Upload failed for {files[idx][0]}: {result}")
                # Fallback to local storage for failed uploads
                local_paths = await _store_local_fallback([files[idx]], prefix)
                results.append(local_paths[0] if local_paths else f"failed-{files[idx][0]}")
            else:
                results.append(result)
        
        logger.info(f"Successfully uploaded {len([r for r in results if not r.startswith('failed-')])}/{len(files)} files")
        return results
    except Exception as e:
        logger.error(f"Critical error during file upload: {e}", exc_info=True)
        # Fallback to local storage
        logger.warning("Falling back to local storage due to upload errors")
        return await _store_local_fallback(files, prefix)


async def download_file(storage_path: str) -> bytes | None:
    """
    Download a file from Supabase Storage.
    :param storage_path: Path to file in storage (e.g., "job_id/contracts/filename.pdf")
    :return: File bytes or None if not found
    """
    client = get_client()
    bucket = settings.supabase_storage_bucket
    if not client or not bucket:
        return None
    
    try:
        def _download(p: str) -> bytes:
            return client.storage.from_(bucket).download(p)
        
        file_bytes = await asyncio.to_thread(_download, storage_path)
        return file_bytes
    except Exception as e:
        logger.error(f"Failed to download file from Supabase: {e}")
        return None

