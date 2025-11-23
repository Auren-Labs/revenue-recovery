"""
Rate limiting middleware for API protection.
"""
from __future__ import annotations

import time
import logging
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)

# In-memory rate limit store (for production, use Redis)
_rate_limit_store: Dict[str, Dict[str, Tuple[int, float]]] = defaultdict(dict)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware to prevent API abuse."""
    
    def __init__(self, app, requests_per_minute: int = 60, requests_per_hour: int = 1000):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.cleanup_interval = 300  # Clean up old entries every 5 minutes
        self.last_cleanup = time.time()
    
    def _get_client_id(self, request: Request) -> str:
        """Get client identifier (IP address or user ID)."""
        # Try to get user ID from auth token
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            # In production, decode JWT to get user_id
            # For now, use IP + path as identifier
            return f"{request.client.host}:{request.url.path}"
        return request.client.host if request.client else "unknown"
    
    def _cleanup_old_entries(self):
        """Remove old rate limit entries to prevent memory leaks."""
        current_time = time.time()
        if current_time - self.last_cleanup < self.cleanup_interval:
            return
        
        cutoff_time = current_time - 3600  # Remove entries older than 1 hour
        for client_id in list(_rate_limit_store.keys()):
            for key in list(_rate_limit_store[client_id].keys()):
                _, timestamp = _rate_limit_store[client_id][key]
                if timestamp < cutoff_time:
                    del _rate_limit_store[client_id][key]
            if not _rate_limit_store[client_id]:
                del _rate_limit_store[client_id]
        
        self.last_cleanup = current_time
    
    def _check_rate_limit(self, client_id: str, window: str) -> Tuple[bool, int, int]:
        """
        Check if client has exceeded rate limit.
        Returns: (is_allowed, current_count, limit)
        """
        current_time = time.time()
        key = f"{window}:{int(current_time)}"
        
        # Get or create window entry
        window_key = f"{window}_{int(current_time / 60)}"  # Per minute
        count, _ = _rate_limit_store[client_id].get(window_key, (0, current_time))
        
        # Determine limit based on window
        if window == "minute":
            limit = self.requests_per_minute
            # Reset count if new minute
            if int(current_time / 60) != int(_rate_limit_store[client_id].get(window_key, (0, 0))[1] / 60):
                count = 0
        else:  # hour
            limit = self.requests_per_hour
            # Reset count if new hour
            if int(current_time / 3600) != int(_rate_limit_store[client_id].get(window_key, (0, 0))[1] / 3600):
                count = 0
        
        # Increment count
        count += 1
        _rate_limit_store[client_id][window_key] = (count, current_time)
        
        is_allowed = count <= limit
        return is_allowed, count, limit
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and docs
        if request.url.path in ["/docs", "/openapi.json", "/auth/health", "/"]:
            return await call_next(request)
        
        # Cleanup old entries periodically
        self._cleanup_old_entries()
        
        client_id = self._get_client_id(request)
        
        # Check per-minute limit
        allowed_minute, count_minute, limit_minute = self._check_rate_limit(client_id, "minute")
        if not allowed_minute:
            logger.warning(f"Rate limit exceeded (minute): {client_id} - {count_minute}/{limit_minute}")
            return Response(
                content=f"Rate limit exceeded: {count_minute} requests per minute (limit: {limit_minute}). Please slow down.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={
                    "X-RateLimit-Limit": str(limit_minute),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + 60),
                    "Retry-After": "60",
                },
            )
        
        # Check per-hour limit
        allowed_hour, count_hour, limit_hour = self._check_rate_limit(client_id, "hour")
        if not allowed_hour:
            logger.warning(f"Rate limit exceeded (hour): {client_id} - {count_hour}/{limit_hour}")
            return Response(
                content=f"Rate limit exceeded: {count_hour} requests per hour (limit: {limit_hour}). Please try again later.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={
                    "X-RateLimit-Limit": str(limit_hour),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + 3600),
                    "Retry-After": "3600",
                },
            )
        
        # Add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit-Minute"] = str(limit_minute)
        response.headers["X-RateLimit-Remaining-Minute"] = str(limit_minute - count_minute)
        response.headers["X-RateLimit-Limit-Hour"] = str(limit_hour)
        response.headers["X-RateLimit-Remaining-Hour"] = str(limit_hour - count_hour)
        
        return response

