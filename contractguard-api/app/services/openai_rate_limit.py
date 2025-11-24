"""
OpenAI API rate limiting and cost protection using Redis.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Optional

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Limits
MAX_OPENAI_CALLS_PER_JOB = 50  # Maximum OpenAI API calls per job
MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER = 500  # Maximum OpenAI API calls per customer per day

# Redis client (lazy initialization)
_redis_client: Optional[redis.Redis] = None

# Module-level in-memory fallback (persists across calls)
_in_memory_tracker: Dict[str, Dict[str, list]] = defaultdict(lambda: {"calls": []})


def _get_redis_client() -> Optional[redis.Redis]:
    """Get Redis client, with fallback to in-memory if Redis unavailable."""
    global _redis_client
    
    if not REDIS_AVAILABLE:
        logger.warning("Redis not available, using in-memory rate limiting (not recommended for production)")
        return None
    
    if _redis_client is None:
        try:
            # Try to connect to Redis from settings
            redis_url = getattr(settings, "redis_broker_url", "redis://localhost:6379/0")
            _redis_client = redis.from_url(redis_url, decode_responses=True)
            # Test connection
            _redis_client.ping()
            logger.info("Redis connected for OpenAI rate limiting")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Using in-memory fallback.")
            _redis_client = None
    
    return _redis_client


def check_openai_rate_limit(customer_id: str, job_id: str) -> tuple[bool, Optional[str]]:
    """
    Check if OpenAI API call is allowed.
    Returns: (is_allowed, error_message)
    """
    redis_client = _get_redis_client()
    
    if redis_client:
        # Use Redis
        try:
            # Check per-job limit
            job_key = f"openai:job:{job_id}:calls"
            job_calls = int(redis_client.get(job_key) or 0)
            
            if job_calls >= MAX_OPENAI_CALLS_PER_JOB:
                return False, f"OpenAI API limit reached for this job ({MAX_OPENAI_CALLS_PER_JOB} calls max)"
            
            # Check per-customer daily limit
            today = datetime.utcnow().date().isoformat()
            customer_key = f"openai:customer:{customer_id}:calls:{today}"
            customer_calls = int(redis_client.get(customer_key) or 0)
            
            if customer_calls >= MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER:
                return False, f"Daily OpenAI API limit reached ({MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER} calls/day)"
            
            return True, None
        except Exception as e:
            logger.error(f"Redis error in rate limit check: {e}")
            # Fall through to in-memory fallback
    
    # In-memory fallback (for development or when Redis unavailable)
    # Use module-level variable (persists across calls)
    global _in_memory_tracker
    
    today = datetime.utcnow().date().isoformat()
    
    # Check per-job limit
    job_key = f"job:{job_id}"
    job_calls = _in_memory_tracker[job_key]["calls"]
    if len(job_calls) >= MAX_OPENAI_CALLS_PER_JOB:
        return False, f"OpenAI API limit reached for this job ({MAX_OPENAI_CALLS_PER_JOB} calls max)"
    
    # Check per-customer daily limit
    customer_key = f"customer:{customer_id}"
    customer_calls = _in_memory_tracker[customer_key]["calls"]
    today_calls = [call for call in customer_calls if call.get("date") == today]
    
    if len(today_calls) >= MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER:
        return False, f"Daily OpenAI API limit reached ({MAX_OPENAI_CALLS_PER_DAY_PER_CUSTOMER} calls/day)"
    
    return True, None


def record_openai_call(customer_id: str, job_id: str, tokens_used: int = 0) -> None:
    """Record an OpenAI API call for rate limiting."""
    redis_client = _get_redis_client()
    
    if redis_client:
        # Use Redis
        try:
            # Increment job counter (no expiry - persists for audit history)
            job_key = f"openai:job:{job_id}:calls"
            redis_client.incr(job_key)
            
            # Track tokens for job
            job_tokens_key = f"openai:job:{job_id}:tokens"
            redis_client.incrby(job_tokens_key, tokens_used)
            
            # Increment customer daily counter (expires at end of day)
            today = datetime.utcnow().date().isoformat()
            customer_key = f"openai:customer:{customer_id}:calls:{today}"
            redis_client.incr(customer_key)
            
            # Set expiry to end of tomorrow (so it clears after 24 hours)
            tomorrow_end = datetime.combine(
                datetime.utcnow().date() + timedelta(days=2),
                datetime.min.time()
            )
            ttl_seconds = int((tomorrow_end - datetime.utcnow()).total_seconds())
            redis_client.expire(customer_key, ttl_seconds)
            
            # Track customer tokens
            customer_tokens_key = f"openai:customer:{customer_id}:tokens:{today}"
            redis_client.incrby(customer_tokens_key, tokens_used)
            redis_client.expire(customer_tokens_key, ttl_seconds)
            
            return
        except Exception as e:
            logger.error(f"Redis error in recording call: {e}")
            # Fall through to in-memory fallback
    
    # In-memory fallback
    # Use module-level variable (persists across calls)
    global _in_memory_tracker
    
    now = datetime.utcnow()
    today = now.date().isoformat()
    
    call_record = {
        "timestamp": now.isoformat(),
        "date": today,
        "tokens": tokens_used,
    }
    
    # Record per job
    job_key = f"job:{job_id}"
    _in_memory_tracker[job_key]["calls"].append(call_record)
    
    # Record per customer
    customer_key = f"customer:{customer_id}"
    _in_memory_tracker[customer_key]["calls"].append(call_record)
    
    # Cleanup old records (older than 7 days)
    cutoff_date = (now - timedelta(days=7)).date().isoformat()
    for key in list(_in_memory_tracker.keys()):
        _in_memory_tracker[key]["calls"] = [
            call for call in _in_memory_tracker[key]["calls"]
            if call.get("date", "") >= cutoff_date
        ]
        if not _in_memory_tracker[key]["calls"]:
            del _in_memory_tracker[key]


def get_openai_usage(customer_id: str, job_id: Optional[str] = None) -> Dict:
    """Get OpenAI API usage statistics."""
    redis_client = _get_redis_client()
    
    result = {
        "today_calls": 0,
        "today_tokens": 0,
        "job_calls": 0,
        "job_tokens": 0,
    }
    
    if redis_client:
        try:
            today = datetime.utcnow().date().isoformat()
            
            if job_id:
                result["job_calls"] = int(redis_client.get(f"openai:job:{job_id}:calls") or 0)
                result["job_tokens"] = int(redis_client.get(f"openai:job:{job_id}:tokens") or 0)
            
            result["today_calls"] = int(redis_client.get(f"openai:customer:{customer_id}:calls:{today}") or 0)
            result["today_tokens"] = int(redis_client.get(f"openai:customer:{customer_id}:tokens:{today}") or 0)
            
            return result
        except Exception as e:
            logger.error(f"Redis error getting usage: {e}")
            # Fall through to in-memory fallback
    
    # In-memory fallback
    # Use module-level variable (persists across calls)
    global _in_memory_tracker
    
    today = datetime.utcnow().date().isoformat()
    
    if job_id:
        job_key = f"job:{job_id}"
        job_calls = _in_memory_tracker[job_key]["calls"]
        result["job_calls"] = len(job_calls)
        result["job_tokens"] = sum(call.get("tokens", 0) for call in job_calls)
    
    customer_key = f"customer:{customer_id}"
    customer_calls = _in_memory_tracker[customer_key]["calls"]
    today_calls = [call for call in customer_calls if call.get("date") == today]
    result["today_calls"] = len(today_calls)
    result["today_tokens"] = sum(call.get("tokens", 0) for call in today_calls)
    
    return result

