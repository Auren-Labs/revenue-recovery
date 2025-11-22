from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.models import Job
from app.services.storage_supabase import get_client

logger = logging.getLogger(__name__)


def _client():
    client = get_client()
    if not client:
        raise RuntimeError("Supabase client not configured")
    return client


def _default_stages():
    return [
        {"name": "upload", "status": "pending", "sequence": 0},
        {"name": "document_extraction", "status": "pending", "sequence": 1},
        {"name": "llm_extraction", "status": "pending", "sequence": 2},
        {"name": "reconciliation", "status": "pending", "sequence": 3},
    ]


def create_job_record(vendor_name: str, organization_id: Optional[str]) -> Job:
    client = _client()
    job_id = str(uuid4())
    now = datetime.utcnow().isoformat()

    client.table("jobs").insert(
        {
            "id": job_id,
            "vendor_name": vendor_name,
            "organization_id": organization_id,
            "created_at": now,
            "updated_at": now,
        }
    ).execute()

    stage_rows = []
    for stage in _default_stages():
        stage_rows.append(
            {
                "id": str(uuid4()),
                "job_id": job_id,
                "name": stage["name"],
                "status": stage["status"],
                "sequence": stage["sequence"],
            }
        )
    client.table("job_stages").insert(stage_rows).execute()
    client.table("job_metrics").upsert({"job_id": job_id, "metrics": {}, "updated_at": now}).execute()

    return load_job(job_id)


def load_job(job_id: str, organization_id: Optional[str] = None) -> Job | None:
    client = _client()
    query = client.table("jobs").select("*").eq("id", job_id)
    if organization_id:
        query = query.eq("organization_id", organization_id)
    response = query.limit(1).execute()
    rows = response.data or []
    if not rows:
        return None
    job_row = rows[0]

    stages = (
        client.table("job_stages")
        .select("*")
        .eq("job_id", job_id)
        .order("sequence", desc=False)
        .execute()
        .data
        or []
    )

    documents = (
        client.table("job_documents").select("*").eq("job_id", job_id).execute().data
        or []
    )

    discrepancies = (
        client.table("job_discrepancies").select("*").eq("job_id", job_id).execute().data
        or []
    )

    metrics_resp = client.table("job_metrics").select("metrics").eq("job_id", job_id).limit(1).execute().data or []
    metrics = metrics_resp[0]["metrics"] if metrics_resp else {}

    job = Job(
        id=job_row["id"],
        vendor_name=job_row["vendor_name"],
        created_at=datetime.fromisoformat(job_row["created_at"].replace("Z", "+00:00")),
        status=job_row.get("status", "queued"),
        message=job_row.get("message"),
        metrics=metrics or {},
        stages=[
            {
                "name": stage["name"],
                "status": stage["status"],
                "detail": stage.get("detail"),
                "started_at": stage.get("started_at"),
                "completed_at": stage.get("completed_at"),
            }
            for stage in stages
        ],
    )

    job.contracts = [
        {
            "filename": doc.get("filename"),
            "storage": doc.get("storage_provider"),
            "storage_path": doc.get("storage_path"),
            "local_path": doc.get("local_path"),
            "metadata": doc.get("metadata"),
        }
        for doc in documents
        if doc.get("document_type") == "contract"
    ]
    job.billing_records = [
        {
            "filename": doc.get("filename"),
            "storage": doc.get("storage_provider"),
            "storage_path": doc.get("storage_path"),
            "local_path": doc.get("local_path"),
            "metadata": doc.get("metadata"),
        }
        for doc in documents
        if doc.get("document_type") == "billing"
    ]
    job.discrepancies = [row.get("data") or {} for row in discrepancies]
    return job


def update_job_status(job_id: str, status: str, message: Optional[str]) -> None:
    client = _client()
    client.table("jobs").update({"status": status, "message": message, "updated_at": datetime.utcnow().isoformat()}).eq(
        "id", job_id
    ).execute()


def update_stage(job_id: str, stage_name: str, status: str, detail: Optional[str]) -> None:
    client = _client()
    resp = (
        client.table("job_stages")
        .select("id, status, started_at, completed_at")
        .eq("job_id", job_id)
        .eq("name", stage_name)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return
    row_id = rows[0]["id"]
    payload: Dict[str, Any] = {"status": status, "detail": detail}
    if status == "in_progress":
        payload["started_at"] = datetime.utcnow().isoformat()
    if status == "completed":
        payload["completed_at"] = datetime.utcnow().isoformat()
    client.table("job_stages").update(payload).eq("id", row_id).execute()


def upsert_documents(job_id: str, documents: List[Dict[str, Any]], document_type: str) -> None:
    if not documents:
        return
    client = _client()
    rows = []
    for doc in documents:
        rows.append(
            {
                "id": str(uuid4()),
                "job_id": job_id,
                "document_type": document_type,
                "filename": doc.get("filename"),
                "storage_provider": doc.get("storage"),
                "storage_path": doc.get("storage_path"),
                "local_path": doc.get("local_path"),
                "metadata": doc.get("metadata") or {},
            }
        )
    client.table("job_documents").insert(rows).execute()


def replace_billing_files(job_id: str, billing_docs: List[Dict[str, Any]]) -> None:
    client = _client()
    client.table("job_documents").delete().eq("job_id", job_id).eq("document_type", "billing").execute()
    upsert_documents(job_id, billing_docs, "billing")


def replace_contract_files(job_id: str, contract_docs: List[Dict[str, Any]]) -> None:
    client = _client()
    client.table("job_documents").delete().eq("job_id", job_id).eq("document_type", "contract").execute()
    upsert_documents(job_id, contract_docs, "contract")


def replace_discrepancies(job_id: str, discrepancies: List[Dict[str, Any]]) -> None:
    client = _client()
    client.table("job_discrepancies").delete().eq("job_id", job_id).execute()
    if not discrepancies:
        return
    rows = []
    for discrepancy in discrepancies:
        rows.append(
            {
                "id": str(uuid4()),
                "job_id": job_id,
                "customer": discrepancy.get("customer"),
                "issue": discrepancy.get("issue"),
                "priority": discrepancy.get("priority"),
                "value": discrepancy.get("value"),
                "due": discrepancy.get("due"),
                "data": discrepancy,
            }
        )
    client.table("job_discrepancies").insert(rows).execute()


def save_metrics(job_id: str, metrics: Dict[str, Any]) -> None:
    client = _client()
    client.table("job_metrics").upsert(
        {
            "job_id": job_id,
            "metrics": metrics or {},
            "updated_at": datetime.utcnow().isoformat(),
        }
    ).execute()


