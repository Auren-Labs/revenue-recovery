from __future__ import annotations

from typing import List
from uuid import uuid4

from azure.storage.blob import BlobServiceClient

from app.config import get_settings

settings = get_settings()

_blob_service: BlobServiceClient | None = None


def get_client() -> BlobServiceClient | None:
    global _blob_service
    if _blob_service or not settings.azure_storage_connection_string:
        return _blob_service
    _blob_service = BlobServiceClient.from_connection_string(settings.azure_storage_connection_string)
    return _blob_service


async def upload_files(files: List[tuple[str, bytes]], prefix: str) -> List[str]:
    client = get_client()
    container = settings.azure_storage_container
    if not client or not container:
        # fallback to supabase/local handled elsewhere
        return []

    container_client = client.get_container_client(container)
    stored_paths = []
    for filename, data in files:
        blob_name = f"{prefix}/{uuid4()}-{filename}"
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(data, overwrite=True)
        stored_paths.append(blob_name)
    return stored_paths


