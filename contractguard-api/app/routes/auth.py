"""
Authentication routes.
"""
from __future__ import annotations

import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

from app.services.auth import get_auth_service
from app.models import User, Customer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


@router.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "message": "Auth service is running"}


class LoginRequest(BaseModel):
    """Login request payload."""
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    """Google OAuth login request payload."""
    access_token: str


class LoginResponse(BaseModel):
    """Login response payload."""
    access_token: str
    token_type: str = "bearer"
    user: Dict
    customer: Dict


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Authenticate user and return access token.
    
    Args:
        request: Login credentials
        
    Returns:
        Access token and user/customer information
    """
    try:
        auth_service = get_auth_service()
        user, customer, token = await auth_service.authenticate(
            request.email, 
            request.password
        )
        
        return LoginResponse(
            access_token=token,
            user=user.to_dict(),
            customer=customer.to_dict(),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to server error"
        )


@router.post("/google", response_model=LoginResponse)
async def google_login(request: GoogleLoginRequest):
    """
    Authenticate user with Google OAuth token and return access token.
    
    Args:
        request: Google OAuth access token
        
    Returns:
        Access token and user/customer information
    """
    logger.info("🔵 Google login request received")
    try:
        logger.info("🔵 Getting auth service...")
        auth_service = get_auth_service()
        logger.info("🔵 Authenticating with Google...")
        user, customer, token = await auth_service.authenticate_google(
            request.access_token
        )
        logger.info(f"🔵 Google authentication successful for user: {user.email}")
        
        return LoginResponse(
            access_token=token,
            user=user.to_dict(),
            customer=customer.to_dict(),
        )
    except HTTPException as e:
        logger.error(f"🔴 Google login HTTPException: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"🔴 Google login failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google login failed due to server error: {str(e)}"
        )


@router.post("/logout")
async def logout():
    """
    Logout user (client should delete token).
    
    Returns:
        Success message
    """
    return {"message": "Logged out successfully"}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> tuple[User, Customer]:
    """
    Dependency to get current authenticated user and customer from JWT token.
    """
    auth_service = get_auth_service()
    token = credentials.credentials
    
    try:
        payload = auth_service.decode_token(token)
        user_id = payload.get("user_id")
        customer_id = payload.get("customer_id")
        
        if not user_id or not customer_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        user = await auth_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        customer = await auth_service.get_customer_by_id(customer_id)
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found"
            )
        
        return user, customer
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get current user: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


class UserInfoResponse(BaseModel):
    """Response model for user info."""
    user: Dict
    customer: Dict


class UpdateProfileRequest(BaseModel):
    """Request model for updating user profile."""
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    """Request model for changing password."""
    current_password: str
    new_password: str


@router.get("/me", response_model=UserInfoResponse)
async def get_current_user_info(
    user_customer: tuple[User, Customer] = Depends(get_current_user)
):
    """
    Get current authenticated user information.
    
    Returns:
        User and customer information
    """
    user, customer = user_customer
    return UserInfoResponse(
        user=user.to_dict(),
        customer=customer.to_dict(),
    )


@router.put("/me", response_model=UserInfoResponse)
async def update_profile(
    request: UpdateProfileRequest,
    user_customer: tuple[User, Customer] = Depends(get_current_user)
):
    """
    Update current user profile.
    
    Returns:
        Updated user and customer information
    """
    user, customer = user_customer
    auth_service = get_auth_service()
    
    updated_user = await auth_service.update_user_profile(
        user.id,
        full_name=request.full_name,
        email=request.email
    )
    
    return UserInfoResponse(
        user=updated_user.to_dict(),
        customer=customer.to_dict(),
    )


@router.post("/me/change-password")
async def change_password(
    request: ChangePasswordRequest,
    user_customer: tuple[User, Customer] = Depends(get_current_user)
):
    """
    Change user password.
    
    Returns:
        Success message
    """
    user, _ = user_customer
    auth_service = get_auth_service()
    
    await auth_service.change_password(
        user.id,
        request.current_password,
        request.new_password
    )
    
    return {"message": "Password changed successfully"}


@router.get("/debug/token")
async def debug_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Debug endpoint to inspect token payload (development only).
    """
    import jwt
    token = credentials.credentials
    
    # Decode without verification to see what's in it
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        logger.info(f"Token payload (unverified): {unverified}")
    except Exception as e:
        logger.error(f"Failed to decode token: {e}")
        unverified = None
    
    # Try with auth service
    try:
        auth_service = get_auth_service()
        verified = auth_service.decode_token(token)
        logger.info(f"Token payload (verified by auth service): {verified}")
    except Exception as e:
        logger.error(f"Auth service decode failed: {e}")
        verified = None
    
    return {
        "unverified_payload": unverified,
        "verified_payload": verified,
        "token_preview": token[:50] + "..." if len(token) > 50 else token,
    }

