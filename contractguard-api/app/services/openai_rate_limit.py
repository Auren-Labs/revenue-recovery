"""
OpenAI API rate limiting and cost protection.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)

# Track OpenAI API calls per customer/job
_openai_call_tracker: Dict[str, Dict[str, list]] = defaultdict(dict)

# Limits
MAX_OPENAI_CALLS_PER_JOB = 50  # Maximum OpenAI API calls per job
MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER = 500  # Maximum OpenAI API calls per customer per day


def check_openai_rate_limit(customer_id: str, job_id: str) -> tuple[bool, Optional[str]]:
    """
    Check if OpenAI API call is allowed.
    Returns: (is_allowed, error_message)
    """
    today = datetime.utcnow().date().isoformat()
    
    # Check per-job limit
    job_calls = _openai_call_tracker.get(f"job:{job_id}", {}).get("calls", [])
    if len(job_calls) >= MAX_OPENAI_CALLS_PER_JOB:
        return False, f"OpenAI API limit reached for this job ({MAX_OPENAI_CALLS_PER_JOB} calls max)"
    
    # Check per-customer daily limit
    customer_key = f"customer:{customer_id}"
    customer_data = _openai_call_tracker.get(customer_key, {})
    today_calls = [call for call in customer_data.get("calls", []) if call.get("date") == today]
    
    if len(today_calls) >= MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER:
        return False, f"Daily OpenAI API limit reached ({MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER} calls/day)"
    
    return True, None


def record_openai_call(customer_id: str, job_id: str, tokens_used: int = 0) -> None:
    """Record an OpenAI API call for rate limiting."""
    now = datetime.utcnow()
    today = now.date().isoformat()
    
    call_record = {
        "timestamp": now.isoformat(),
        "date": today,
        "tokens": tokens_used,
    }
    
    # Record per job
    job_key = f"job:{job_id}"
    if job_key not in _openai_call_tracker:
        _openai_call_tracker[job_key] = {"calls": []}
    _openai_call_tracker[job_key]["calls"].append(call_record)
    
    # Record per customer
    customer_key = f"customer:{customer_id}"
    if customer_key not in _openai_call_tracker:
        _openai_call_tracker[customer_key] = {"calls": []}
    _openai_call_tracker[customer_key]["calls"].append(call_record)
    
    # Cleanup old records (older than 7 days)
    cutoff_date = (now - timedelta(days=7)).date().isoformat()
    for key in list(_openai_call_tracker.keys()):
        _openai_call_tracker[key]["calls"] = [
            call for call in _openai_call_tracker[key]["calls"]
            if call.get("date", "") >= cutoff_date
        ]
        if not _openai_call_tracker[key]["calls"]:
            del _openai_call_tracker[key]


def get_openai_usage(customer_id: str, job_id: Optional[str] = None) -> Dict:
    """Get OpenAI API usage statistics."""
    today = datetime.utcnow().date().isoformat()
    
    result = {
        "today_calls": 0,
        "today_tokens": 0,
        "job_calls": 0,
        "job_tokens": 0,
    }
    
    if job_id:
        job_calls = _openai_call_tracker.get(f"job:{job_id}", {}).get("calls", [])
        result["job_calls"] = len(job_calls)
        result["job_tokens"] = sum(call.get("tokens", 0) for call in job_calls)
    
    customer_key = f"customer:{customer_id}"
    customer_calls = _openai_call_tracker.get(customer_key, {}).get("calls", [])
    today_calls = [call for call in customer_calls if call.get("date") == today]
    result["today_calls"] = len(today_calls)
    result["today_tokens"] = sum(call.get("tokens", 0) for call in today_calls)
    
    return result

