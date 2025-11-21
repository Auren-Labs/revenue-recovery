from __future__ import annotations

import inspect
import sys
from pathlib import Path
import tempfile
from typing import List
from uuid import uuid4

import httpx

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
    global _supabase_client
    if _supabase_client or not settings.supabase_url or not settings.supabase_service_key:
        return _supabase_client
    _supabase_client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _supabase_client


async def upload_files(files: List[tuple[str, bytes]], prefix: str) -> List[str]:
    """
    Uploads files to Supabase Storage.
    :param files: list of tuples (filename, bytes)
    :param prefix: folder path within the bucket
    :return: list of public paths
    """
    client = get_client()
    bucket = settings.supabase_storage_bucket
    if not client or not bucket:
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

    stored_paths = []
    for filename, data in files:
        path = f"{prefix}/{uuid4()}-{filename}"
        client.storage.from_(bucket).upload(path, data, file_options={"contentType": "application/octet-stream"})
        stored_paths.append(path)
    return stored_paths

