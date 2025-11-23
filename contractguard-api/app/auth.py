from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)
settings = get_settings()


def _decode_token(token: str) -> Dict[str, Any]:
    if not settings.supabase_jwt_secret:
        raise ValueError("JWT secret not configured")
    return jwt.decode(
        token,
        settings.supabase_jwt_secret,
        algorithms=["HS256"],
        audience=settings.supabase_url,
        options={"verify_aud": False},
    )


def _default_user() -> Dict[str, Any]:
    return {
        "user_id": "dev-user",
        "role": "admin",
        "organization_id": None,
        "email": "dev@contractguard.local",
    }


async def require_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Dict[str, Any]:
    """
    Validates the JWT token and returns the user payload.
    Supports both Supabase JWT and custom JWT tokens.
    Falls back to a development user when JWT secret is not set.
    """
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    token = credentials.credentials
    
    # If no JWT secret is configured, try to use auth service (which has a default)
    if not settings.supabase_jwt_secret:
        try:
            from app.services.auth import get_auth_service
            auth_service = get_auth_service()
            payload = auth_service.decode_token(token)
            customer_id = payload.get("customer_id")
            if customer_id:
                return {
                    "user_id": payload.get("user_id"),
                    "email": payload.get("email"),
                    "role": payload.get("role", "viewer"),
                    "organization_id": customer_id,
                    "customer_id": customer_id,
                }
        except Exception:
            pass
        # If decoding fails, return default user
        return _default_user()
    
    # Try to decode as custom JWT first (from our auth service)
    try:
        from app.services.auth import get_auth_service
        auth_service = get_auth_service()
        payload = auth_service.decode_token(token)
        
        logger.debug(f"Decoded custom JWT: user_id={payload.get('user_id')}, customer_id={payload.get('customer_id')}")
        
        # Custom JWT format (from our auth service)
        customer_id = payload.get("customer_id")
        if not customer_id:
            logger.warning(f"Custom JWT missing customer_id: {payload}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token missing customer_id"
            )
        
        return {
            "user_id": payload.get("user_id"),
            "email": payload.get("email"),
            "role": payload.get("role", "viewer"),
            "organization_id": customer_id,  # Map customer_id to organization_id
            "customer_id": customer_id,  # Also include customer_id for clarity
        }
    except HTTPException:
        # Re-raise HTTP exceptions (like expired token, invalid token)
        raise
    except (jwt.InvalidTokenError, jwt.ExpiredSignatureError, jwt.DecodeError) as e:
        # If custom JWT fails with JWT errors, try Supabase JWT format
        logger.debug(f"Custom JWT decode failed ({type(e).__name__}), trying Supabase format")
        try:
            payload = _decode_token(token)
            metadata = payload.get("user_metadata") or {}
            app_metadata = payload.get("app_metadata") or {}
            customer_id = metadata.get("organization_id") or payload.get("org_id") or payload.get("customer_id")
            
            if not customer_id:
                logger.warning(f"Supabase JWT missing customer_id: {payload}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Token missing customer_id"
                )
            
            return {
                "user_id": payload.get("sub") or payload.get("user_id"),
                "email": payload.get("email"),
                "role": app_metadata.get("role") or metadata.get("role") or "viewer",
                "organization_id": customer_id,
                "customer_id": customer_id,
            }
        except jwt.InvalidTokenError as exc:
            logger.warning("Invalid JWT: %s", exc)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    except Exception as e:
        # Log unexpected errors but don't expose details
        logger.error(f"Unexpected error decoding token: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token validation failed"
        ) from e



