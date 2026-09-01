"""
Authentication service: registration, login, user retrieval.
"""

import secrets
from datetime import datetime, timezone

from app.config.db import get_supabase
from app.config.security import hash_password, verify_password
from app.config.token import create_access_token
from app.config.settings import get_settings
from app.schema.schemas import (
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    UserRole,
)


async def register_user(data: UserRegister) -> TokenResponse:
    """Register a new user and return a JWT."""
    db = get_supabase()
    settings = get_settings()

    # Check for existing email
    existing = db.table("users").select("id").eq("email", data.email).execute()
    if existing.data:
        raise ValueError("An account with this email already exists.")

    now = datetime.now(timezone.utc).isoformat()
    user_id = str(secrets.token_hex(16))

    user_record = {
        "id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role.value,
        "facility_name": data.facility_name if data.role == UserRole.PROVIDER else None,
        "created_at": now,
        "updated_at": now,
    }

    db.table("users").insert(user_record).execute()

    token = create_access_token({"sub": user_id, "role": data.role.value})

    user_resp = UserResponse(
        id=user_id,
        email=data.email,
        name=data.name,
        role=data.role,
        facility_name=data.facility_name,
        created_at=now,
    )

    return TokenResponse(access_token=token, user=user_resp)


async def login_user(data: UserLogin) -> TokenResponse:
    """Authenticate and return a JWT."""
    db = get_supabase()

    result = db.table("users").select("*").eq("email", data.email).limit(1).execute()
    if not result.data:
        raise ValueError("Invalid email or password.")

    user = result.data[0]
    if not verify_password(data.password, user["password_hash"]):
        raise ValueError("Invalid email or password.")

    token = create_access_token({"sub": user["id"], "role": user["role"]})

    user_resp = UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=UserRole(user["role"]),
        facility_name=user.get("facility_name"),
        created_at=user["created_at"],
    )

    return TokenResponse(access_token=token, user=user_resp)


async def get_user_by_id(user_id: str) -> dict | None:
    """Fetch a user by ID."""
    db = get_supabase()
    result = db.table("users").select("*").eq("id", user_id).limit(1).execute()
    return result.data[0] if result.data else None


async def update_user_profile(user_id: str, name: str, facility_name: str | None = None) -> dict:
    """Update user's name and facility name."""
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    update_data = {"name": name, "updated_at": now}
    if facility_name is not None:
        update_data["facility_name"] = facility_name

    db.table("users").update(update_data).eq("id", user_id).execute()

    updated = db.table("users").select("*").eq("id", user_id).limit(1).execute()
    if not updated.data:
        raise ValueError("User not found.")
    return updated.data[0]


async def change_user_password(user_id: str, current_password: str, new_password: str) -> None:
    """Change user's password after verifying the current one."""
    db = get_supabase()

    result = db.table("users").select("*").eq("id", user_id).limit(1).execute()
    if not result.data:
        raise ValueError("User not found.")

    user = result.data[0]
    if not verify_password(current_password, user["password_hash"]):
        raise ValueError("Current password is incorrect.")

    now = datetime.now(timezone.utc).isoformat()
    db.table("users").update({
        "password_hash": hash_password(new_password),
        "updated_at": now,
    }).eq("id", user_id).execute()
