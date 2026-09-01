"""
Auth router: registration, login, profile update, password change.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.config.token import decode_access_token
from app.schema.schemas import UserRegister, UserLogin, TokenResponse, UserResponse
from app.services.auth_service import (
    register_user, login_user, get_user_by_id,
    update_user_profile, change_user_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from the JWT."""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    user = await get_user_by_id(payload["sub"])
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister):
    """Register a new user."""
    try:
        return await register_user(data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    """Authenticate and receive a JWT."""
    try:
        return await login_user(data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.get("/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user)):
    """Get the currently authenticated user."""
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        facility_name=user.get("facility_name"),
        created_at=user["created_at"],
    )


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    facility_name: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.put("/me", response_model=UserResponse)
async def update_profile(data: ProfileUpdate, user: dict = Depends(get_current_user)):
    """Update the current user's name and facility name."""
    try:
        updated = await update_user_profile(
            user_id=user["id"],
            name=data.name,
            facility_name=data.facility_name,
        )
        return UserResponse(
            id=updated["id"],
            email=updated["email"],
            name=updated["name"],
            role=updated["role"],
            facility_name=updated.get("facility_name"),
            created_at=updated["created_at"],
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/change-password")
async def change_password(data: PasswordChange, user: dict = Depends(get_current_user)):
    """Change the current user's password."""
    try:
        await change_user_password(
            user_id=user["id"],
            current_password=data.current_password,
            new_password=data.new_password,
        )
        return {"message": "Password updated successfully."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
