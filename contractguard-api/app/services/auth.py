"""
Authentication and authorization service.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional
import httpx

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.models import Customer, User, UserRole, SubscriptionTier, SubscriptionStatus
from app.services.storage_supabase import get_client as get_supabase_client

logger = logging.getLogger(__name__)
settings = get_settings()

security = HTTPBearer()


class AuthService:
    """Handle authentication and authorization."""

    def __init__(self):
        self.supabase = get_supabase_client()
        self.jwt_secret = settings.supabase_jwt_secret or "your-secret-key-change-this"
        self.jwt_algorithm = "HS256"
        self.jwt_expiration_hours = 24

    def hash_password(self, password: str) -> str:
        """Hash a password using bcrypt."""
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    def verify_password(self, password: str, password_hash: str) -> bool:
        """Verify a password against its hash."""
        try:
            return bcrypt.checkpw(password.encode(), password_hash.encode())
        except Exception as e:
            logger.error(f"Password verification failed: {e}")
            return False

    def create_access_token(self, user: User, customer: Customer) -> str:
        """Create a JWT access token."""
        expiration = datetime.utcnow() + timedelta(hours=self.jwt_expiration_hours)
        payload = {
            "user_id": user.id,
            "customer_id": customer.id,
            "email": user.email,
            "role": user.role.value,
            "exp": expiration,
            "iat": datetime.utcnow(),
        }
        return jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)

    def decode_token(self, token: str) -> dict:
        """Decode and validate a JWT token."""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[self.jwt_algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            )
        except jwt.JWTError as e:
            logger.error(f"JWT decode error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        if not self.supabase:
            return None

        try:
            response = self.supabase.table("users").select("*").eq("email", email).execute()
            if response.data and len(response.data) > 0:
                return User.from_dict(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Failed to get user by email: {e}")
            return None

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        if not self.supabase:
            return None

        try:
            response = self.supabase.table("users").select("*").eq("id", user_id).execute()
            if response.data and len(response.data) > 0:
                return User.from_dict(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Failed to get user by ID: {e}")
            return None

    async def get_customer_by_id(self, customer_id: str) -> Optional[Customer]:
        """Get customer by ID."""
        if not self.supabase:
            return None

        try:
            response = self.supabase.table("customers").select("*").eq("id", customer_id).execute()
            if response.data and len(response.data) > 0:
                return Customer.from_dict(response.data[0])
            return None
        except Exception as e:
            logger.error(f"Failed to get customer by ID: {e}")
            return None

    async def authenticate(self, email: str, password: str) -> tuple[User, Customer, str]:
        """Authenticate user and return user, customer, and token."""
        user = await self.get_user_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is disabled",
            )

        # Get password hash from database
        response = self.supabase.table("users").select("password_hash").eq("id", user.id).execute()
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        password_hash = response.data[0].get("password_hash")
        
        # Check if user has a password (not a Google-only user)
        if password_hash is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This account uses Google Sign-In. Please use Google to log in.",
            )
        
        if not self.verify_password(password, password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        customer = await self.get_customer_by_id(user.customer_id)
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer organization not found",
            )

        # Update last login
        try:
            self.supabase.table("users").update({"last_login": datetime.utcnow().isoformat()}).eq(
                "id", user.id
            ).execute()
        except Exception as e:
            logger.warning(f"Failed to update last login: {e}")

        token = self.create_access_token(user, customer)
        return user, customer, token

    async def update_user_profile(self, user_id: str, full_name: Optional[str] = None, email: Optional[str] = None) -> User:
        """Update user profile information."""
        if not self.supabase:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database connection not available"
            )
        
        # Check if email is already taken by another user
        if email:
            existing_user = await self.get_user_by_email(email)
            if existing_user and existing_user.id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use"
                )
        
        update_data = {"updated_at": datetime.utcnow().isoformat()}
        if full_name is not None:
            update_data["full_name"] = full_name
        if email is not None:
            update_data["email"] = email
        
        try:
            self.supabase.table("users").update(update_data).eq("id", user_id).execute()
            updated_user = await self.get_user_by_id(user_id)
            if not updated_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            return updated_user
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to update user profile: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update profile"
            )

    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        """Change user password."""
        if not self.supabase:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database connection not available"
            )
        
        # Get current password hash
        response = self.supabase.table("users").select("password_hash").eq("id", user_id).execute()
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        password_hash = response.data[0].get("password_hash")
        
        # Check if user has a password (not a Google-only user)
        if password_hash is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account uses Google Sign-In. Password cannot be changed."
            )
        
        # Verify current password
        if not self.verify_password(current_password, password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect"
            )
        
        # Hash and update new password
        new_password_hash = self.hash_password(new_password)
        try:
            self.supabase.table("users").update({
                "password_hash": new_password_hash,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", user_id).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to change password: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to change password"
            )

    async def authenticate_google(self, google_access_token: str) -> tuple[User, Customer, str]:
        """Authenticate user with Google OAuth access token."""
        logger.info("🔵 Starting Google authentication...")
        try:
            # Fetch user info from Google using the access token
            logger.info("🔵 Fetching user info from Google API...")
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
                    response = await client.get(
                        "https://www.googleapis.com/oauth2/v2/userinfo",
                        headers={"Authorization": f"Bearer {google_access_token}"},
                    )
                    
                    if response.status_code != 200:
                        logger.error(f"🔴 Google API returned status {response.status_code}: {response.text[:200]}")
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid Google access token"
                        )
                    
                    user_info = response.json()
                    logger.info(f"🔵 Successfully fetched user info from Google: {user_info.get('email', 'no email')}")
            except httpx.TimeoutException as e:
                logger.error(f"🔴 Timeout calling Google API: {e}")
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Google authentication timed out. Please try again."
                )
            except httpx.RequestError as e:
                logger.error(f"🔴 Network error calling Google API: {e}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Unable to connect to Google authentication service. Please try again."
                )
            
            # Extract user info from Google
            google_email = user_info.get('email')
            google_name = user_info.get('name', '')
            
            if not google_email:
                logger.error("🔴 Google account does not have an email address")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Google account does not have an email address"
                )
            
            logger.info(f"🔵 Looking up user in database: {google_email}")
            # Check if user exists
            user = await self.get_user_by_email(google_email)
            
            if user:
                # Existing user - update last login
                logger.info(f"🔵 Existing user found: {user.email}")
                if not user.is_active:
                    logger.error(f"🔴 User account is disabled: {user.email}")
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="User account is disabled",
                    )
                logger.info(f"🔵 Fetching customer: {user.customer_id}")
                customer = await self.get_customer_by_id(user.customer_id)
                if not customer:
                    logger.error(f"🔴 Customer not found: {user.customer_id}")
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Customer organization not found",
                    )
                logger.info(f"🔵 Customer found: {customer.name}")
            else:
                # New user - create user and customer
                logger.info(f"🔵 Creating new user and customer for: {google_email}")
                # Create a new customer for this user
                customer_id = str(uuid.uuid4())
                now = datetime.utcnow()
                
                # Prepare data for database (ISO strings)
                customer_db_data = {
                    "id": customer_id,
                    "name": google_name.split()[0] + "'s Organization" if google_name else "New Organization",
                    "subscription_tier": SubscriptionTier.TRIAL.value,
                    "subscription_status": SubscriptionStatus.ACTIVE.value,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
                
                logger.info(f"🔵 Inserting customer into database...")
                try:
                    self.supabase.table("customers").insert(customer_db_data).execute()
                    logger.info(f"🔵 Customer created successfully: {customer_id}")
                except Exception as e:
                    logger.error(f"🔴 Failed to create customer: {e}", exc_info=True)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create customer organization"
                    )
                
                # Create Customer object with datetime objects
                customer = Customer(
                    id=customer_id,
                    name=customer_db_data["name"],
                    subscription_tier=SubscriptionTier.TRIAL,
                    subscription_status=SubscriptionStatus.ACTIVE,
                    created_at=now,
                    updated_at=now,
                )
                
                # Create user
                user_id = str(uuid.uuid4())
                
                # Prepare data for database (ISO strings)
                user_db_data = {
                    "id": user_id,
                    "customer_id": customer_id,
                    "email": google_email,
                    "full_name": google_name,
                    "role": UserRole.OWNER.value,
                    "is_active": True,
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
                
                logger.info(f"🔵 Inserting user into database...")
                try:
                    self.supabase.table("users").insert(user_db_data).execute()
                    logger.info(f"🔵 User created successfully: {user_id}")
                except Exception as e:
                    logger.error(f"🔴 Failed to create user: {e}", exc_info=True)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create user account"
                    )
                
                # Create User object with datetime objects
                user = User(
                    id=user_id,
                    customer_id=customer_id,
                    email=google_email,
                    full_name=google_name,
                    role=UserRole.OWNER,
                    created_at=now,
                    updated_at=now,
                    is_active=True,
                )
            
            # Update last login
            try:
                self.supabase.table("users").update({"last_login": datetime.utcnow().isoformat()}).eq(
                    "id", user.id
                ).execute()
            except Exception as e:
                logger.warning(f"Failed to update last login: {e}")
            
            logger.info(f"🔵 Creating access token for user: {user.email}")
            token = self.create_access_token(user, customer)
            logger.info(f"✅ Google authentication successful for: {user.email}")
            return user, customer, token
            
        except HTTPException:
            raise
        except httpx.TimeoutException as e:
            logger.error(f"🔴 Timeout calling Google API: {e}")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Google authentication timed out. Please try again."
            )
        except httpx.RequestError as e:
            logger.error(f"🔴 Network error calling Google API: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to connect to Google authentication service. Please try again."
            )
        except Exception as e:
            logger.error(f"🔴 Google authentication failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Google authentication failed: {str(e)}",
            )


# Global auth service instance
_auth_service = None


def get_auth_service() -> AuthService:
    """Get or create auth service instance."""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service


# FastAPI dependencies
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """Get authenticated user from JWT token."""
    auth_service = get_auth_service()
    token = credentials.credentials
    payload = auth_service.decode_token(token)

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


async def get_current_customer(user: User = Depends(get_current_user)) -> Customer:
    """Get customer organization for current user."""
    auth_service = get_auth_service()
    customer = await auth_service.get_customer_by_id(user.customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer organization not found",
        )
    return customer


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
) -> Optional[User]:
    """Get authenticated user from JWT token (optional for development)."""
    if not credentials:
        # For development: return demo user
        logger.warning("No auth token provided, using demo user")
        auth_service = get_auth_service()
        return await auth_service.get_user_by_id("00000000-0000-0000-0000-000000000002")

    return await get_current_user(credentials)

