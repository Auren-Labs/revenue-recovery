"""
Renewal Intelligence API endpoints
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import require_user
from app.services import job_manager, job_repository
from app.services.renewal_agent import (
    extract_termination_date,
    generate_negotiation_pack,
    run_renewal_intelligence_daily,
    send_90_day_alert,
    send_final_warning,
    send_negotiation_pack,
)
from app.services.storage_supabase import get_client

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/upcoming")
async def get_upcoming_renewals(
    current_user=Depends(require_user),
    limit: int = Query(10, ge=1, le=100),
) -> dict:
    """
    Get upcoming contract renewals for the current user.
    
    Returns:
        List of contracts with renewal dates and days until renewal
    """
    customer_id = current_user.get("organization_id")
    if not customer_id:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    # Get all completed jobs
    client = get_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database service unavailable")
    
    jobs_response = (
        client.table("jobs")
        .select("id, vendor_name, customer_id, status, user_type")
        .eq("customer_id", customer_id)
        .eq("status", "completed")
        .order("created_at", desc=True)
        .limit(limit * 2)  # Get more to filter
        .execute()
    )
    
    jobs = jobs_response.data or []
    upcoming_renewals = []
    
    today = date.today()
    
    for job_data in jobs:
        job = job_manager.get_job(job_data["id"], customer_id)
        if not job:
            continue
        
        termination_date = extract_termination_date(job)
        if not termination_date:
            continue
        
        days_left = (termination_date - today).days
        
        # Only include renewals in the next 365 days
        if 0 <= days_left <= 365:
            metrics = job.metrics or {}
            recoverable_amount = metrics.get("recoverable_amount", 0)
            currency = metrics.get("currency", "INR")
            
            # Get latest alert status
            alerts_response = (
                client.table("renewal_alerts")
                .select("alert_type, sent_at, status")
                .eq("job_id", job_data["id"])
                .order("sent_at", desc=True)
                .limit(1)
                .execute()
            )
            
            latest_alert = alerts_response.data[0] if alerts_response.data else None
            
            upcoming_renewals.append({
                "job_id": job_data["id"],
                "vendor_name": job_data["vendor_name"],
                "termination_date": termination_date.isoformat(),
                "days_until_renewal": days_left,
                "recoverable_amount": recoverable_amount,
                "currency": currency,
                "user_type": job_data.get("user_type", "customer"),
                "latest_alert": latest_alert,
            })
    
    # Sort by days until renewal
    upcoming_renewals.sort(key=lambda x: x["days_until_renewal"])
    
    return {
        "renewals": upcoming_renewals[:limit],
        "total": len(upcoming_renewals),
    }


@router.get("/negotiation-pack/{job_id}")
async def get_negotiation_pack(
    job_id: str,
    current_user=Depends(require_user),
) -> dict:
    """
    Get negotiation pack for a specific contract.
    
    Returns:
        Negotiation pack with leverage score and recommendations
    """
    customer_id = current_user.get("organization_id")
    if not customer_id:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    termination_date = extract_termination_date(job)
    if not termination_date:
        raise HTTPException(status_code=404, detail="No termination date found for this contract")
    
    today = date.today()
    days_left = (termination_date - today).days
    
    pack = generate_negotiation_pack(job, days_left)
    
    return {
        "job_id": job_id,
        "vendor_name": job.vendor_name,
        "termination_date": termination_date.isoformat(),
        "days_until_renewal": days_left,
        **pack,
    }


@router.post("/trigger-alert/{job_id}")
async def trigger_renewal_alert(
    job_id: str,
    alert_type: str = Query(..., regex="^(90_day|60_day|30_day)$"),
    current_user=Depends(require_user),
) -> dict:
    """
    Manually trigger a renewal alert for testing or immediate sending.
    
    Args:
        job_id: Job ID
        alert_type: Type of alert to send (90_day, 60_day, 30_day)
    """
    customer_id = current_user.get("organization_id")
    if not customer_id:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    termination_date = extract_termination_date(job)
    if not termination_date:
        raise HTTPException(status_code=404, detail="No termination date found for this contract")
    
    today = date.today()
    days_left = (termination_date - today).days
    
    # Get user email from current_user if available
    user_email = current_user.get("email")
    
    try:
        if alert_type == "90_day":
            await send_90_day_alert(job, days_left, user_email)
        elif alert_type == "60_day":
            await send_negotiation_pack(job, days_left, user_email)
        elif alert_type == "30_day":
            await send_final_warning(job, days_left, user_email)
        
        return {
            "success": True,
            "message": f"{alert_type} alert sent successfully",
            "days_until_renewal": days_left,
        }
    except Exception as e:
        logger.error(f"Failed to send {alert_type} alert: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send alert: {str(e)}")


@router.post("/run-daily-check")
async def run_daily_renewal_check(
    current_user=Depends(require_user),
) -> dict:
    """
    Manually trigger the daily renewal intelligence check.
    
    Note: In production, this should be called by a scheduled job (cron, Celery, etc.)
    """
    # Check if user is admin (optional - remove if you want all users to trigger)
    # For now, allow any authenticated user
    
    try:
        results = await run_renewal_intelligence_daily()
        return {
            "success": True,
            "results": results,
        }
    except Exception as e:
        logger.error(f"Daily renewal check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Check failed: {str(e)}")


@router.get("/alerts/{job_id}")
async def get_renewal_alerts(
    job_id: str,
    current_user=Depends(require_user),
) -> dict:
    """
    Get all renewal alerts for a specific job.
    """
    customer_id = current_user.get("organization_id")
    if not customer_id:
        raise HTTPException(status_code=401, detail="User not authenticated")
    
    # Verify job belongs to user
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    client = get_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database service unavailable")
    
    alerts_response = (
        client.table("renewal_alerts")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at", desc=True)
        .execute()
    )
    
    return {
        "job_id": job_id,
        "alerts": alerts_response.data or [],
    }

