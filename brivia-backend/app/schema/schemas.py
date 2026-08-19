"""
Pydantic schemas for request/response validation.
"""

from datetime import datetime, date
from enum import Enum

from pydantic import BaseModel, Field, EmailStr


# --- Enums ---

class UserRole(str, Enum):
    PROVIDER = "provider"
    PATIENT = "patient"


class BillStatus(str, Enum):
    ISSUED = "ISSUED"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, Enum):
    CREATED = "CREATED"
    INITIATED = "INITIATED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


# --- Auth ---

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=200)
    role: UserRole = UserRole.PATIENT
    facility_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    facility_name: str | None = None
    created_at: str


# --- Bills ---

class BillCreate(BaseModel):
    patient_name: str = Field(min_length=1, max_length=200)
    patient_email: EmailStr | None = None
    description: str = Field(min_length=1, max_length=500)
    amount_minor: int = Field(gt=0, description="Amount in kobo-equivalent minor units")
    currency: str = Field(default="NGN", max_length=3)
    due_date: date


class BillResponse(BaseModel):
    id: str
    public_bill_id: str
    provider_id: str
    patient_name: str
    description: str
    amount_minor: int
    currency: str
    amount_paid_minor: int
    remaining_balance_minor: int
    status: BillStatus
    due_date: str
    created_at: str
    updated_at: str


class BillShareResponse(BaseModel):
    share_token: str
    share_url: str
    bill_id: str
    expires_at: str | None = None


# --- Payments ---

class PaymentCreate(BaseModel):
    amount_minor: int = Field(gt=0, description="Amount in kobo-equivalent minor units")
    contributor_name: str = Field(default="Anonymous", max_length=200)
    idempotency_key: str = Field(min_length=8)


class PaymentResponse(BaseModel):
    id: str
    bill_id: str
    contributor_name: str
    amount_minor: int
    currency: str
    status: PaymentStatus
    payment_reference: str
    created_at: str


class PublicBillResponse(BaseModel):
    """Limited bill view for unauthenticated contributors."""
    public_bill_id: str
    provider_name: str
    facility_name: str
    description: str
    amount_minor: int
    currency: str
    amount_paid_minor: int
    remaining_balance_minor: int
    status: BillStatus
    due_date: str


# --- Audit ---

class AuditLogResponse(BaseModel):
    id: str
    actor_id: str | None
    action: str
    resource_type: str
    resource_id: str
    metadata: dict | None = None
    created_at: str
