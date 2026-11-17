"""Pydantic models for the Care Circle (v2) API."""

from pydantic import BaseModel, Field

from app.schema.schemas import PaymentResponse


# --- Bill lines ------------------------------------------------------------

class BillLineInput(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    amount_minor: int = Field(gt=0)


class BillLinesReplace(BaseModel):
    lines: list[BillLineInput] = Field(min_length=1, max_length=25)


class BillLineOut(BaseModel):
    id: str
    label: str
    amount_minor: int
    funded_minor: int
    remaining_minor: int
    position: int


# --- Public care page ------------------------------------------------------

class TelegramStatus(BaseModel):
    configured: bool
    bot_username: str | None = None
    message: str


class CareBill(BaseModel):
    public_bill_id: str
    description: str
    provider_name: str
    facility_name: str
    currency: str
    amount_minor: int
    amount_paid_minor: int
    remaining_balance_minor: int
    status: str
    due_date: str
    lines: list[BillLineOut]
    verified: bool
    verify_note: str | None = None


class CircleEntry(BaseModel):
    contributor_name: str
    initials: str
    amount_minor: int
    line_label: str | None = None
    created_at: str


class CareResponse(BaseModel):
    bill: CareBill
    circle: list[CircleEntry]
    telegram: TelegramStatus
    currencies: list[str]


# --- Quotes ----------------------------------------------------------------

class QuoteRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    currency: str = "NGN"
    line_id: str | None = None
    sender_wallet_url: str | None = None


class QuoteResponse(BaseModel):
    currency: str
    bill_currency: str
    debit_minor: int
    receive_minor: int
    fee_minor: int
    net_minor: int
    rate: float
    source: str
    expires_at: str
    note: str


# --- Contributions ---------------------------------------------------------

class ClaimRequest(BaseModel):
    amount_minor: int = Field(gt=0, description="Amount in the bill's currency, minor units")
    contributor_name: str = Field(default="Anonymous", max_length=200)
    idempotency_key: str = Field(min_length=8)
    line_id: str | None = None


class ClaimResponse(BaseModel):
    payment: PaymentResponse
    line_id: str | None = None
    receipt_path: str
    message: str


# --- Receipts --------------------------------------------------------------

class ReceiptResponse(BaseModel):
    payment_reference: str
    contributor_name: str
    gross_minor: int
    fee_minor: int
    net_minor: int
    currency: str
    bill_public_id: str
    description: str
    provider_name: str
    facility_name: str
    line_label: str | None = None
    status: str
    created_at: str


# --- Provider reconciliation ----------------------------------------------

class ReconRow(BaseModel):
    payment_reference: str
    contributor_name: str
    line_label: str | None = None
    gross_minor: int
    fee_minor: int
    net_minor: int
    status: str
    external_payment_id: str | None = None
    created_at: str


class ReconTotals(BaseModel):
    gross_minor: int
    fee_minor: int
    net_minor: int
    settled_count: int
    pending_count: int


class ReconResponse(BaseModel):
    bill_public_id: str
    currency: str
    rows: list[ReconRow]
    totals: ReconTotals


# --- Verification ---------------------------------------------------------

class VerifyResponse(BaseModel):
    verified: bool
    algorithm: str | None = None
    signed_at: str | None = None
    payload_hash: str | None = None
    note: str


# --- Telegram -------------------------------------------------------------

class TelegramSubscribeRequest(BaseModel):
    chat_id: str | None = Field(default=None, max_length=64)
    handle: str | None = Field(default=None, max_length=64)


class NotificationRow(BaseModel):
    id: str
    channel: str
    bill_id: str | None = None
    body: str
    status: str
    created_at: str
    sent_at: str | None = None
