"""
Renewal Intelligence Agent
Monitors contract renewal dates and sends proactive alerts at 90, 60, and 30 days before renewal.
Generates negotiation packs with leverage analysis.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple

from app.services import job_manager
from app.services.email_service import EmailService
from app.services.storage_supabase import get_client

logger = logging.getLogger(__name__)


def extract_termination_date(job: Any) -> Optional[date]:
    """
    Extract contract termination/renewal date from job metadata.
    
    Checks:
    1. GPT-4o contract terms (termination_date, end_date, expiry_date)
    2. Contract documents metadata
    3. Job metrics
    
    Returns:
        Termination date if found, None otherwise
    """
    # Check job metrics first
    metrics = job.metrics or {}
    
    # Check for termination_date in metrics
    termination_date_str = metrics.get("termination_date")
    if termination_date_str:
        try:
            if isinstance(termination_date_str, str):
                return datetime.fromisoformat(termination_date_str).date()
            return termination_date_str
        except (ValueError, TypeError):
            pass
    
    # Check contract documents for GPT-4o terms
    for contract in (job.contracts or []):
        metadata = contract.get("metadata", {})
        gpt4o_terms = metadata.get("gpt4o_contract_terms", {})
        
        if not gpt4o_terms:
            continue
        
        # Check various date fields
        for date_field in ["termination_date", "end_date", "expiry_date", "contract_end_date", "renewal_date"]:
            date_value = gpt4o_terms.get(date_field)
            if date_value:
                try:
                    if isinstance(date_value, str):
                        return datetime.fromisoformat(date_value).date()
                    elif isinstance(date_value, date):
                        return date_value
                except (ValueError, TypeError):
                    continue
        
        # Check base_pricing for end_date
        base_pricing = gpt4o_terms.get("base_pricing", {})
        end_date = base_pricing.get("end_date")
        if end_date:
            try:
                if isinstance(end_date, str):
                    return datetime.fromisoformat(end_date).date()
                elif isinstance(end_date, date):
                    return end_date
            except (ValueError, TypeError):
                pass
    
    return None


def calculate_leverage_score(job: Any) -> Tuple[int, Dict[str, Any]]:
    """
    Calculate negotiation leverage score (0-100) based on:
    - Recovered leakage amount
    - SLA performance
    - Market rates
    - Contract compliance
    
    Returns:
        Tuple of (score, details)
    """
    metrics = job.metrics or {}
    discrepancies = job.discrepancies or []
    
    leverage_factors = {
        "recovered_leakage": 0,
        "sla_credits": 0,
        "market_advantage": 0,
        "compliance": 0,
    }
    
    # Factor 1: Recovered leakage (max 40 points)
    recoverable_amount = metrics.get("recoverable_amount", 0)
    total_billed = metrics.get("billing_summary", {}).get("total_billed", 0)
    if total_billed > 0:
        leakage_percentage = (recoverable_amount / total_billed) * 100
        leverage_factors["recovered_leakage"] = min(40, leakage_percentage * 0.4)
    
    # Factor 2: SLA credits claimed (max 20 points)
    sla_discrepancies = [d for d in discrepancies if "sla" in d.get("issue", "").lower()]
    if sla_discrepancies:
        leverage_factors["sla_credits"] = min(20, len(sla_discrepancies) * 5)
    
    # Factor 3: Market advantage (placeholder - would need market data)
    # For now, give points if we have significant leakage
    if recoverable_amount > 100000:  # > ₹1L
        leverage_factors["market_advantage"] = 20
    elif recoverable_amount > 50000:  # > ₹50K
        leverage_factors["market_advantage"] = 10
    
    # Factor 4: Compliance (max 20 points)
    # If vendor has been compliant (low discrepancy rate), lower leverage
    discrepancy_rate = len(discrepancies) / max(1, metrics.get("billing_summary", {}).get("invoice_count", 1))
    if discrepancy_rate < 0.05:  # < 5% discrepancy rate
        leverage_factors["compliance"] = 5
    elif discrepancy_rate > 0.15:  # > 15% discrepancy rate
        leverage_factors["compliance"] = 20
    
    total_score = sum(leverage_factors.values())
    
    return int(min(100, total_score)), leverage_factors


def generate_negotiation_pack(job: Any, days_until_renewal: int) -> Dict[str, Any]:
    """
    Generate negotiation pack with leverage analysis and recommendations.
    
    Returns:
        Dict with negotiation brief data
    """
    metrics = job.metrics or {}
    discrepancies = job.discrepancies or []
    
    leverage_score, leverage_details = calculate_leverage_score(job)
    
    recoverable_amount = metrics.get("recoverable_amount", 0)
    total_billed = metrics.get("billing_summary", {}).get("total_billed", 0)
    currency = metrics.get("currency", "INR")
    
    # Calculate annual spend
    avg_invoice = metrics.get("billing_summary", {}).get("avg_invoice", 0)
    annual_spend = avg_invoice * 12 if avg_invoice > 0 else total_billed
    
    # Generate recommendations
    recommendations = []
    if leverage_score >= 80:
        recommendations.append("Strong leverage: Request 0% increase for 2026")
        recommendations.append("Consider multi-year lock-in at current rates")
    elif leverage_score >= 60:
        recommendations.append("Good leverage: Negotiate <3% increase")
        recommendations.append("Request improved SLA terms")
    else:
        recommendations.append("Moderate leverage: Focus on fixing current issues")
        recommendations.append("Request transparency on pricing changes")
    
    return {
        "vendor_name": job.vendor_name,
        "contract_id": job.id,
        "days_until_renewal": days_until_renewal,
        "leverage_score": leverage_score,
        "leverage_details": leverage_details,
        "annual_spend": annual_spend,
        "recovered_leakage": recoverable_amount,
        "currency": currency,
        "discrepancy_count": len(discrepancies),
        "recommendations": recommendations,
        "generated_at": datetime.utcnow().isoformat(),
    }


async def send_90_day_alert(job: Any, days_left: int, user_email: Optional[str] = None) -> bool:
    """Send 90-day renewal alert."""
    email_service = EmailService()
    termination_date = extract_termination_date(job)
    
    if not termination_date:
        logger.warning(f"Job {job.id}: No termination date found, skipping 90-day alert")
        return False
    
    recoverable_amount = job.metrics.get("recoverable_amount", 0) if job.metrics else 0
    currency = job.metrics.get("currency", "INR") if job.metrics else "INR"
    currency_symbol = "₹" if currency == "INR" else "$"
    
    subject = f"⏰ Renewal Alert: {job.vendor_name} renews in {days_left} days"
    
    dashboard_url = f"http://localhost:8080/dashboard?job={job.id}"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #ff9800, #f57c00); color: white; padding: 30px; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
            .button {{ display: inline-block; background: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .metric {{ background: white; padding: 15px; border-radius: 6px; margin: 10px 0; }}
            .metric-label {{ font-size: 12px; color: #666; text-transform: uppercase; }}
            .metric-value {{ font-size: 24px; font-weight: bold; color: #f57c00; margin-top: 5px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⏰ Renewal Alert</h1>
                <p><strong>{job.vendor_name}</strong> contract renews on <strong>{termination_date.strftime('%B %d, %Y')}</strong></p>
            </div>
            <div class="content">
                <h2>Time to Negotiate</h2>
                
                <div class="metric">
                    <div class="metric-label">Days Until Renewal</div>
                    <div class="metric-value">{days_left} days</div>
                </div>
                
                <div class="metric">
                    <div class="metric-label">Recovered Leakage</div>
                    <div class="metric-value">{currency_symbol}{recoverable_amount:,.0f}</div>
                </div>
                
                <p>You've saved <strong>{currency_symbol}{recoverable_amount:,.0f}</strong> in leakage recovery. Use this leverage in renewal negotiations.</p>
                
                <a href="{dashboard_url}" class="button">View Negotiation Pack</a>
                
                <p style="margin-top: 30px; font-size: 12px; color: #666;">
                    This is an automated renewal alert from ContractGuard.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_body = f"""
    Renewal Alert: {job.vendor_name}
    
    Contract renews on {termination_date.strftime('%B %d, %Y')} ({days_left} days).
    
    You've saved {currency_symbol}{recoverable_amount:,.0f} in leakage recovery.
    Use this leverage in renewal negotiations.
    
    View dashboard: {dashboard_url}
    """
    
    # Store alert in database
    _record_renewal_alert(job.id, "90_day", {"days_left": days_left, "termination_date": termination_date.isoformat()})
    
    if user_email:
        return email_service.send_email(user_email, subject, html_body, text_body)
    return True


async def send_negotiation_pack(job: Any, days_left: int, user_email: Optional[str] = None) -> bool:
    """Send 60-day negotiation pack."""
    email_service = EmailService()
    pack = generate_negotiation_pack(job, days_left)
    termination_date = extract_termination_date(job)
    
    if not termination_date:
        return False
    
    currency_symbol = "₹" if pack["currency"] == "INR" else "$"
    
    subject = f"📊 Negotiation Pack: {job.vendor_name} - Your Leverage Score: {pack['leverage_score']}/100"
    
    dashboard_url = f"http://localhost:8080/dashboard?job={job.id}"
    
    recommendations_html = "".join([f"<li>{rec}</li>" for rec in pack["recommendations"]])
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #2196F3, #1976D2); color: white; padding: 30px; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
            .button {{ display: inline-block; background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .metric {{ background: white; padding: 15px; border-radius: 6px; margin: 10px 0; }}
            .metric-label {{ font-size: 12px; color: #666; text-transform: uppercase; }}
            .metric-value {{ font-size: 24px; font-weight: bold; color: #1976D2; margin-top: 5px; }}
            .score {{ font-size: 48px; font-weight: bold; color: #4CAF50; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Negotiation Pack</h1>
                <p><strong>{job.vendor_name}</strong> | Renews: {termination_date.strftime('%B %d, %Y')}</p>
            </div>
            <div class="content">
                <div class="metric">
                    <div class="metric-label">Your Leverage Score</div>
                    <div class="score">{pack['leverage_score']}/100</div>
                </div>
                
                <div class="metric">
                    <div class="metric-label">Annual Spend</div>
                    <div class="metric-value">{currency_symbol}{pack['annual_spend']:,.0f}</div>
                </div>
                
                <div class="metric">
                    <div class="metric-label">Recovered Leakage</div>
                    <div class="metric-value">{currency_symbol}{pack['recovered_leakage']:,.0f}</div>
                </div>
                
                <h3>Recommended Asks:</h3>
                <ul>
                    {recommendations_html}
                </ul>
                
                <a href="{dashboard_url}" class="button">View Full Negotiation Brief</a>
                
                <p style="margin-top: 30px; font-size: 12px; color: #666;">
                    This is an automated negotiation pack from ContractGuard.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_body = f"""
    Negotiation Pack: {job.vendor_name}
    
    Your Leverage Score: {pack['leverage_score']}/100
    
    Annual Spend: {currency_symbol}{pack['annual_spend']:,.0f}
    Recovered Leakage: {currency_symbol}{pack['recovered_leakage']:,.0f}
    
    Recommended Asks:
    {chr(10).join(pack['recommendations'])}
    
    View full brief: {dashboard_url}
    """
    
    # Store alert in database
    _record_renewal_alert(job.id, "60_day", {"pack": pack})
    
    if user_email:
        return email_service.send_email(user_email, subject, html_body, text_body)
    return True


async def send_final_warning(job: Any, days_left: int, user_email: Optional[str] = None) -> bool:
    """Send 30-day final warning."""
    email_service = EmailService()
    termination_date = extract_termination_date(job)
    
    if not termination_date:
        return False
    
    subject = f"⚠️ Final Warning: {job.vendor_name} renews in {days_left} days"
    
    dashboard_url = f"http://localhost:8080/dashboard?job={job.id}"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #f44336, #d32f2f); color: white; padding: 30px; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
            .button {{ display: inline-block; background: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .warning-box {{ background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ Final Warning</h1>
                <p><strong>{job.vendor_name}</strong> contract renews on <strong>{termination_date.strftime('%B %d, %Y')}</strong></p>
            </div>
            <div class="content">
                <div class="warning-box">
                    <strong>Only {days_left} days remaining!</strong><br>
                    Time to finalize renewal negotiations or prepare for termination.
                </div>
                
                <p>Book a 15-minute prep call with AI Co-Pilot to review your negotiation strategy.</p>
                
                <a href="{dashboard_url}" class="button">Schedule Prep Call</a>
                
                <p style="margin-top: 30px; font-size: 12px; color: #666;">
                    This is an automated renewal alert from ContractGuard.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_body = f"""
    Final Warning: {job.vendor_name}
    
    Contract renews on {termination_date.strftime('%B %d, %Y')} ({days_left} days remaining).
    
    Time to finalize renewal negotiations or prepare for termination.
    
    Schedule prep call: {dashboard_url}
    """
    
    # Store alert in database
    _record_renewal_alert(job.id, "30_day", {"days_left": days_left, "termination_date": termination_date.isoformat()})
    
    if user_email:
        return email_service.send_email(user_email, subject, html_body, text_body)
    return True


def _record_renewal_alert(job_id: str, alert_type: str, metadata: Dict[str, Any]) -> None:
    """Record renewal alert in database."""
    try:
        client = get_client()
        if not client:
            logger.warning("Supabase client not available, skipping alert recording")
            return
        
        client.table("renewal_alerts").insert({
            "job_id": job_id,
            "alert_type": alert_type,
            "status": "sent",
            "sent_at": datetime.utcnow().isoformat(),
            "metadata": metadata,
        }).execute()
        logger.info(f"Recorded {alert_type} alert for job {job_id}")
    except Exception as e:
        logger.error(f"Failed to record renewal alert: {e}")


async def run_renewal_intelligence_daily() -> Dict[str, Any]:
    """
    Main function to run daily renewal intelligence checks.
    
    Should be called by a scheduled job (cron, Celery, etc.)
    """
    today = date.today()
    results = {
        "checked": 0,
        "alerts_sent": 0,
        "errors": [],
    }
    
    try:
        # Get all completed jobs
        client = get_client()
        if not client:
            logger.warning("Supabase client not available, skipping renewal check")
            return results
        
        jobs_response = (
            client.table("jobs")
            .select("id, vendor_name, customer_id, status, user_type")
            .eq("status", "completed")
            .execute()
        )
        
        jobs = jobs_response.data or []
        results["checked"] = len(jobs)
        
        for job_data in jobs:
            try:
                job_id = job_data["id"]
                job = job_manager.get_job(job_id, job_data.get("customer_id"))
                
                if not job:
                    continue
                
                termination_date = extract_termination_date(job)
                if not termination_date:
                    continue
                
                days_left = (termination_date - today).days
                
                # Check if alert already sent for this milestone
                existing_alerts = (
                    client.table("renewal_alerts")
                    .select("alert_type")
                    .eq("job_id", job_id)
                    .eq("status", "sent")
                    .execute()
                )
                
                sent_types = {a["alert_type"] for a in (existing_alerts.data or [])}
                
                # Send appropriate alerts
                # Trigger within a 3-day window and only once
                if 87 <= days_left <= 93 and "90_day" not in sent_types:
                    await send_90_day_alert(job, days_left)
                elif 57 <= days_left <= 63 and "60_day" not in sent_types:
                    await send_negotiation_pack(job, days_left)
                elif 27 <= days_left <= 33 and "30_day" not in sent_types:
                    await send_final_warning(job, days_left)
                    results["alerts_sent"] += 1
                elif days_left <= 0 and "terminated" not in sent_types:
                    # Auto-termination protection
                    logger.warning(f"Job {job_id}: Contract expired but not terminated")
                    _record_renewal_alert(job_id, "terminated", {"termination_date": termination_date.isoformat()})
                    
            except Exception as e:
                logger.error(f"Error processing job {job_data.get('id')}: {e}")
                results["errors"].append(str(e))
        
        logger.info(f"Renewal intelligence check complete: {results['alerts_sent']} alerts sent for {results['checked']} jobs")
        
    except Exception as e:
        logger.error(f"Renewal intelligence check failed: {e}")
        results["errors"].append(str(e))
    
    return results

