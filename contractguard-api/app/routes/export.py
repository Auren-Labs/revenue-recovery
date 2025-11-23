"""
Export routes for generating CSV and PDF reports.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import require_user
from app.services import job_manager
from app.services.export_service import (
    export_discrepancies_csv,
    export_metrics_summary_csv,
    export_full_report_pdf,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{job_id}/discrepancies.csv")
async def export_discrepancies(
    job_id: str,
    current_user=Depends(require_user)
):
    """
    Export discrepancies as CSV.
    
    Returns:
        CSV file download
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Customer ID not found in token")
    
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed to export")
    
    csv_data = export_discrepancies_csv(job)
    
    filename = f"{job.vendor_name}_discrepancies_{job.created_at.strftime('%Y%m%d')}.csv"
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/{job_id}/metrics.csv")
async def export_metrics(
    job_id: str,
    current_user=Depends(require_user)
):
    """
    Export metrics summary as CSV.
    
    Returns:
        CSV file download
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Customer ID not found in token")
    
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed to export")
    
    csv_data = export_metrics_summary_csv(job)
    
    filename = f"{job.vendor_name}_metrics_{job.created_at.strftime('%Y%m%d')}.csv"
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/{job_id}/report.html")
async def export_report(
    job_id: str,
    current_user=Depends(require_user)
):
    """
    Export full audit report as HTML (can be printed to PDF).
    
    Returns:
        HTML file download
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Customer ID not found in token")
    
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed to export")
    
    html_data = export_full_report_pdf(job)
    
    filename = f"{job.vendor_name}_audit_report_{job.created_at.strftime('%Y%m%d')}.html"
    
    return Response(
        content=html_data,
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )

