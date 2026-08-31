"""
Payments router: payment initiation and history.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.routers.auth import get_current_user
from pydantic import BaseModel

from app.schema.schemas import PaymentCreate, PaymentResponse
from app.services.payment_service import (
    initiate_contribution,
    get_payments_for_bill,
    get_payment_by_id,
    create_incoming_payment_for_bill,
    create_outgoing_grant,
    finalize_and_execute_payment,
    poll_payment_settlement,
)

router = APIRouter(prefix="/payments", tags=["Payments"])


class IncomingPaymentRequest(BaseModel):
    receiver_wallet_url: str | None = None


class OutgoingGrantRequest(BaseModel):
    sender_wallet_url: str
    amount_minor: int


class FinalizePaymentRequest(BaseModel):
    payment_id: str
    continue_uri: str
    continue_token: str
    sender_wallet_url: str


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    bill_id: str,
    data: PaymentCreate,
    user: dict = Depends(get_current_user),
):
    """Initiate a payment contribution to a bill."""
    try:
        return await initiate_contribution(
            bill_id=bill_id,
            data=data,
            contributor_id=user["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/bill/{bill_id}", response_model=list[PaymentResponse])
async def list_bill_payments(
    bill_id: str,
    user: dict = Depends(get_current_user),
):
    """List all payments for a specific bill."""
    return await get_payments_for_bill(bill_id)


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific payment by ID."""
    payment = await get_payment_by_id(payment_id)
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    return payment


# --- Open Payments endpoints ---

@router.post("/bill/{bill_id}/incoming", response_model=dict)
async def create_incoming(
    bill_id: str,
    data: IncomingPaymentRequest,
    user: dict = Depends(get_current_user),
):
    """
    Create an incoming payment on the receiver's wallet for a bill.
    Only providers can do this.
    """
    if user["role"] != "provider":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only providers can set up incoming payments.",
        )
    try:
        return await create_incoming_payment_for_bill(
            bill_id=bill_id,
            receiver_wallet_url=data.receiver_wallet_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/bill/{bill_id}/outgoing-grant", response_model=dict)
async def create_outgoing(
    bill_id: str,
    data: OutgoingGrantRequest,
    user: dict = Depends(get_current_user),
):
    """
    Create an outgoing payment grant for a contributor.
    Returns a URL the contributor must visit to approve.
    """
    try:
        return await create_outgoing_grant(
            bill_id=bill_id,
            sender_wallet_url=data.sender_wallet_url,
            amount_minor=data.amount_minor,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/finalize", response_model=dict)
async def finalize(
    data: FinalizePaymentRequest,
    user: dict = Depends(get_current_user),
):
    """
    Finalize the outgoing payment after user approved the grant.
    """
    try:
        return await finalize_and_execute_payment(
            payment_id=data.payment_id,
            continue_uri=data.continue_uri,
            continue_token=data.continue_token,
            sender_wallet_url=data.sender_wallet_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/bill/{bill_id}/poll", response_model=dict)
async def poll_settlement(
    bill_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Poll the incoming payment to check if funds have arrived.
    """
    try:
        return await poll_payment_settlement(bill_id=bill_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# --- Public outgoing grant endpoint (no auth required) ---

@router.post("/outgoing-grant", response_model=dict)
async def create_public_outgoing_grant(data: OutgoingGrantRequest):
    """
    Create an outgoing payment grant for a contributor (public, no auth).
    Uses public_bill_id to look up the bill.
    """
    from app.services.bill_service import get_bill_by_public_id
    
    # This is a simplified lookup - in production, you'd use the share token
    # For now, we'll need to pass the bill_id directly
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Use the share token endpoint instead."
    )
