from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.models import Job
from app.services.storage_supabase import get_client

logger = logging.getLogger(__name__)


def _client():
    """Get Supabase client with error handling."""
    client = get_client()
    if not client:
        logger.warning("Supabase client not available - some operations may fail")
        # Return None instead of raising - let callers handle it
        return None
    return client


def _default_stages():
    return [
        {"name": "upload", "status": "pending", "sequence": 0},
        {"name": "document_extraction", "status": "pending", "sequence": 1},
        {"name": "llm_extraction", "status": "pending", "sequence": 2},
        {"name": "reconciliation", "status": "pending", "sequence": 3},
    ]


def create_job_record(vendor_name: str, organization_id: Optional[str], user_type: str = "customer") -> Job:
    """Create a new job record. Returns Job object."""
    client = _client()
    if not client:
        raise RuntimeError("Supabase client not configured - cannot create job")
    
    job_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    
    # Validate user_type
    if user_type not in ["customer", "vendor"]:
        user_type = "customer"  # Default to customer if invalid

    try:
        # Create job with timeout protection
        logger.info(f"Creating job {job_id} for vendor {vendor_name} (user_type: {user_type})")
        
        # Build insert data
        insert_data = {
            "id": job_id,
            "vendor_name": vendor_name,
            "customer_id": organization_id,  # Use customer_id (matches DB schema)
            "created_at": now,
            "updated_at": now,
        }
        
        # Try to include user_type, but handle if column doesn't exist yet
        try:
            insert_data["user_type"] = user_type
            client.table("jobs").insert(insert_data).execute()
        except Exception as e:
            error_msg = str(e)
            if "user_type" in error_msg.lower() or "column" in error_msg.lower():
                # Column doesn't exist yet - try without user_type
                logger.warning(f"user_type column not found in database. Please run migration: supabase/migrations/20241201000000_add_user_type_to_jobs.sql")
                insert_data.pop("user_type", None)
                client.table("jobs").insert(insert_data).execute()
            else:
                raise

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

        logger.info(f"Successfully created job {job_id}")
        return load_job(job_id)
    except Exception as e:
        logger.error(f"Failed to create job {job_id}: {e}", exc_info=True)
        raise RuntimeError(f"Failed to create job: {str(e)}")


def load_job(job_id: str, organization_id: Optional[str] = None) -> Job | None:
    client = _client()
    query = client.table("jobs").select("*").eq("id", job_id)
    if organization_id:
        query = query.eq("customer_id", organization_id)  # Use customer_id (matches DB schema)
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
        customer_id=job_row.get("customer_id"),
        user_type=job_row.get("user_type") or "customer",  # Default to customer for backward compatibility
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
    """Upsert documents. Non-blocking with error handling."""
    if not documents:
        return
    client = _client()
    if not client:
        logger.warning(f"Cannot save documents for job {job_id} - Supabase not available")
        return
    try:
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
    except Exception as e:
        logger.error(f"Failed to save documents for job {job_id}: {e}", exc_info=True)
        # Don't raise - files are already stored locally


def replace_billing_files(job_id: str, billing_docs: List[Dict[str, Any]]) -> None:
    """Replace billing files. Non-blocking with error handling."""
    client = _client()
    if not client:
        logger.warning(f"Cannot save billing files for job {job_id} - Supabase not available")
        return
    try:
        client.table("job_documents").delete().eq("job_id", job_id).eq("document_type", "billing").execute()
        upsert_documents(job_id, billing_docs, "billing")
    except Exception as e:
        logger.error(f"Failed to save billing files for job {job_id}: {e}", exc_info=True)
        # Don't raise - files are already stored locally


def replace_contract_files(job_id: str, contract_docs: List[Dict[str, Any]]) -> None:
    """Replace contract files. Non-blocking with error handling."""
    client = _client()
    if not client:
        logger.warning(f"Cannot save contract files for job {job_id} - Supabase not available")
        return
    try:
        client.table("job_documents").delete().eq("job_id", job_id).eq("document_type", "contract").execute()
        upsert_documents(job_id, contract_docs, "contract")
    except Exception as e:
        logger.error(f"Failed to save contract files for job {job_id}: {e}", exc_info=True)
        # Don't raise - files are already stored locally


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
    """Save job metrics. Non-blocking with error handling."""
    client = _client()
    if not client:
        logger.warning(f"Cannot save metrics for job {job_id} - Supabase not available")
        return
    try:
        client.table("job_metrics").upsert(
            {
                "job_id": job_id,
                "metrics": metrics or {},
                "updated_at": datetime.utcnow().isoformat(),
            }
        ).execute()
    except Exception as e:
        logger.error(f"Failed to save metrics for job {job_id}: {e}", exc_info=True)
        # Don't raise - metrics can be saved later


def list_jobs(customer_id: str, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """List all jobs for a customer, ordered by most recent first."""
    client = _client()
    
    # Get job summaries (without full details)
    jobs_response = (
        client.table("jobs")
        .select("id, vendor_name, status, message, created_at, updated_at, customer_id")
        .eq("customer_id", customer_id)
        .order("created_at", desc=True)
        .limit(limit)
        .offset(offset)
        .execute()
    )
    
    jobs = jobs_response.data or []
    
    # Get metrics for each job
    job_ids = [job["id"] for job in jobs]
    if not job_ids:
        return []
    
    metrics_response = (
        client.table("job_metrics")
        .select("job_id, metrics")
        .in_("job_id", job_ids)
        .execute()
    )
    
    metrics_map = {m["job_id"]: m.get("metrics", {}) for m in (metrics_response.data or [])}
    
    # Get discrepancy counts
    discrepancies_response = (
        client.table("job_discrepancies")
        .select("job_id")
        .in_("job_id", job_ids)
        .execute()
    )
    
    # Count discrepancies per job
    discrepancy_counts = {}
    for disc in (discrepancies_response.data or []):
        job_id = disc["job_id"]
        discrepancy_counts[job_id] = discrepancy_counts.get(job_id, 0) + 1
    
    # Combine data
    result = []
    for job in jobs:
        job_id = job["id"]
        metrics = metrics_map.get(job_id, {})
        result.append({
            "id": job_id,
            "vendor_name": job["vendor_name"],
            "status": job.get("status", "queued"),
            "message": job.get("message"),
            "created_at": job["created_at"],
            "updated_at": job.get("updated_at"),
            "recoverable_amount": metrics.get("recoverable_amount", 0),
            "total_billed": metrics.get("billing_summary", {}).get("total_billed", 0),
            "discrepancy_count": discrepancy_counts.get(job_id, 0),
        })
    
    return result


def delete_job(job_id: str, customer_id: str) -> bool:
    """Delete a job and all its related data."""
    client = _client()
    
    # Verify the job belongs to the customer
    job_response = (
        client.table("jobs")
        .select("id, customer_id")
        .eq("id", job_id)
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    
    if not job_response.data:
        return False
    
    # Delete job (cascade will handle related records due to ON DELETE CASCADE)
    # But we'll also explicitly delete to be safe
    try:
        # Delete related records first (due to foreign key constraints)
        client.table("job_discrepancies").delete().eq("job_id", job_id).execute()
        client.table("job_metrics").delete().eq("job_id", job_id).execute()
        client.table("job_stages").delete().eq("job_id", job_id).execute()
        client.table("job_documents").delete().eq("job_id", job_id).execute()
        client.table("contract_chunks").delete().eq("job_id", job_id).execute()
        client.table("billing_chunks").delete().eq("job_id", job_id).execute()
        
        # Delete the job itself
        client.table("jobs").delete().eq("id", job_id).execute()
        
        return True
    except Exception as e:
        logger.error(f"Failed to delete job {job_id}: {e}")
        return False


