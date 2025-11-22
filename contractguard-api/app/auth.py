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
    Validates the Supabase JWT (when configured) and returns the user payload.
    Falls back to a development user when JWT secret is not set.
    """
    if not settings.supabase_jwt_secret:
        return _default_user()

    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    token = credentials.credentials
    try:
        payload = _decode_token(token)
    except jwt.InvalidTokenError as exc:
        logger.warning("Invalid JWT: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    metadata = payload.get("user_metadata") or {}
    app_metadata = payload.get("app_metadata") or {}
    return {
        "user_id": payload.get("sub"),
        "email": payload.get("email"),
        "role": app_metadata.get("role") or metadata.get("role") or "viewer",
        "organization_id": metadata.get("organization_id") or payload.get("org_id"),
    }



