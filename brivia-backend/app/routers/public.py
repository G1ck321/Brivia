"""Public router: unauthenticated endpoints for bill sharing and contributor payments."""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.config.db import get_supabase
from app.schema.schemas import (
    PublicBillResponse,
    PaymentCreate,
    PaymentResponse,
    PaymentStatus,
    OpenPaymentsInitiateRequest,
    OpenPaymentsInitiateResponse,
    OpenPaymentsCallbackResponse,
)
from app.services.bill_service import get_public_bill_by_token
from app.services.payment_service import (
    initiate_contribution,
    calculate_platform_fee,
)
from app.config.settings import get_settings

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/bills/{share_token}", response_model=PublicBillResponse)
async def get_public_bill(share_token: str):
    """
    Get limited bill information via a share token.
    This is the endpoint contributors hit when they open a shared link.
    No authentication required.
    """
    result = await get_public_bill_by_token(share_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This bill link is invalid or has expired.",
        )
    return result[0]


@router.post("/bills/{share_token}/pay", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def contribute_to_bill(share_token: str, data: PaymentCreate):
    """
    Make a contribution to a bill via its share token.
    No authentication required for contributors.
    """
    result = await get_public_bill_by_token(share_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This bill link is invalid or has expired.",
        )

    _, bill_id = result

    try:
        return await initiate_contribution(
            bill_id=bill_id,
            data=data,
            contributor_id=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# --- Open Payments Flow ---

@router.post("/bills/{share_token}/pay/open-payments", response_model=OpenPaymentsInitiateResponse)
async def initiate_open_payments(share_token: str, data: OpenPaymentsInitiateRequest):
    """
    Initiate an Open Payments flow.
    Returns a redirect URL where the contributor approves the payment.
    No authentication required.
    """
    settings = get_settings()
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Validate bill
    result = await get_public_bill_by_token(share_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This bill link is invalid or has expired.",
        )

    _, bill_id = result

    # Get bill details
    bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not bill_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found.")

    bill = bill_result.data[0]

    if bill["status"] == "PAID":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bill is already fully funded.")

    if bill["status"] == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bill has been cancelled.")

    if data.amount_minor > bill["remaining_balance_minor"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount exceeds remaining balance of {bill['remaining_balance_minor']}."
        )

    # Get or create incoming payment for this bill
    incoming_payment_id = bill.get("external_payment_id")
    if not incoming_payment_id:
        # Set up incoming payment via OP server (Node.js SDK handles auth correctly)
        receiver_wallet = settings.OP_RECEIVING_WALLET_URL or "https://ilp.interledger-test.dev/practice"
        op_url = settings.OP_SERVER_URL or "http://localhost:3100"

        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as hc:
                resp = await hc.post(
                    f"{op_url}/setup-incoming",
                    json={
                        "receiver_wallet_url": receiver_wallet,
                        "amount_minor": bill["amount_minor"],
                        "reference": bill["public_bill_id"],
                    },
                )
                resp.raise_for_status()
                incoming_result = resp.json()
            incoming_payment_id = incoming_result["incoming_payment_id"]

            # Store on bill
            db.table("bills").update({
                "external_payment_id": incoming_payment_id,
                "updated_at": now,
            }).eq("id", bill_id).execute()

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to set up incoming payment: {str(e)}"
            )

    # Create payment record
    payment_id = str(secrets.token_hex(16))
    payment_ref = f"BRV-PAY-{secrets.token_hex(6).upper()}"

    payment_record = {
        "id": payment_id,
        "bill_id": bill_id,
        "contributor_id": None,
        "contributor_name": data.contributor_name,
        "amount_minor": data.amount_minor,
        "currency": bill["currency"],
        "status": PaymentStatus.INITIATED.value,
        "payment_reference": payment_ref,
        "external_payment_id": None,
        "idempotency_key": secrets.token_hex(16),
        "created_at": now,
        "updated_at": now,
    }
    db.table("payments").insert(payment_record).execute()

    # Initiate outgoing payment grant via OP server
    try:
        import httpx
        op_url = settings.OP_SERVER_URL or "http://localhost:3100"

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{op_url}/initiate-outgoing",
                json={
                    "sender_wallet_url": data.sender_wallet_url,
                    "incoming_payment_url": incoming_payment_id,
                    "amount_minor": data.amount_minor,
                },
            )
            resp.raise_for_status()
            grant_result = resp.json()

    except Exception as e:
        # Mark payment as failed
        db.table("payments").update({
            "status": PaymentStatus.FAILED.value,
            "updated_at": now,
        }).eq("id", payment_id).execute()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initiate payment: {str(e)}"
        )

    # Store grant details in audit log for later continuation
    db.table("audit_logs").insert({
        "id": str(secrets.token_hex(16)),
        "actor_id": None,
        "action": "OPEN_PAYMENTS_INITIATED",
        "resource_type": "payment",
        "resource_id": payment_id,
        "metadata": {
            "continue_uri": grant_result["continue_uri"],
            "continue_token": grant_result["continue_token"],
            "quote_id": grant_result["quote_id"],
            "bill_id": bill_id,
            "incoming_payment_id": incoming_payment_id,
            "sender_wallet_url": data.sender_wallet_url,
        },
        "created_at": now,
    }).execute()

    return OpenPaymentsInitiateResponse(
        payment_id=payment_id,
        redirect_url=grant_result["interact_redirect"],
        message="Open this URL to approve the payment in your wallet",
    )


@router.get("/bills/{share_token}/pay/callback", response_model=OpenPaymentsCallbackResponse)
async def open_payments_callback(
    share_token: str,
    payment_id: str = Query(...),
    interact_hash: str | None = Query(None),
):
    """
    Callback after user approves the payment in their wallet.
    Finalizes the grant and executes the outgoing payment.
    """
    settings = get_settings()
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Validate bill
    result = await get_public_bill_by_token(share_token)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid bill link.")

    _, bill_id = result

    # Get payment record
    payment_result = db.table("payments").select("*").eq("id", payment_id).limit(1).execute()
    if not payment_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")

    payment = payment_result.data[0]

    # Get grant details from audit log
    audit_result = (
        db.table("audit_logs")
        .select("metadata")
        .eq("resource_id", payment_id)
        .eq("action", "OPEN_PAYMENTS_INITIATED")
        .limit(1)
        .execute()
    )

    if not audit_result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Grant details not found.")

    metadata = audit_result.data[0]["metadata"]
    continue_uri = metadata["continue_uri"]
    continue_token = metadata["continue_token"]
    quote_id = metadata["quote_id"]
    sender_wallet_url = metadata["sender_wallet_url"]

    # Finalize the grant via OP server
    try:
        import httpx
        op_url = settings.OP_SERVER_URL or "http://localhost:3100"

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{op_url}/finalize-payment",
                json={
                    "continue_uri": continue_uri,
                    "continue_token": continue_token,
                    "sender_wallet_url": sender_wallet_url,
                    "quote_id": quote_id,
                    "description": "Brivia bill contribution",
                },
            )
            resp.raise_for_status()
            payment_result = resp.json()

    except Exception as e:
        db.table("payments").update({
            "status": PaymentStatus.FAILED.value,
            "updated_at": now,
        }).eq("id", payment_id).execute()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to finalize payment: {str(e)}"
        )

    # Calculate platform fee
    platform_fee = calculate_platform_fee(payment["amount_minor"])
    net_amount = payment["amount_minor"] - platform_fee

    # Update payment record
    db.table("payments").update({
        "status": PaymentStatus.COMPLETED.value,
        "external_payment_id": payment_result.get("payment_id"),
        "updated_at": now,
    }).eq("id", payment_id).execute()

    # Update bill
    updated_bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    new_bill_status = "ISSUED"
    if updated_bill_result.data:
        current_bill = updated_bill_result.data[0]
        new_amount_paid = current_bill["amount_paid_minor"] + net_amount
        new_remaining = current_bill["remaining_balance_minor"] - net_amount
        new_bill_status = "PAID" if new_remaining <= 0 else "PARTIALLY_PAID"

        db.table("bills").update({
            "amount_paid_minor": new_amount_paid,
            "remaining_balance_minor": max(new_remaining, 0),
            "status": new_bill_status,
            "updated_at": now,
        }).eq("id", bill_id).execute()

        # Audit
        db.table("audit_logs").insert({
            "id": str(secrets.token_hex(16)),
            "actor_id": None,
            "action": "PAYMENT_COMPLETED",
            "resource_type": "payment",
            "resource_id": payment_id,
            "metadata": {
                "bill_id": bill_id,
                "amount_minor": payment["amount_minor"],
                "new_bill_status": new_bill_status,
            },
            "created_at": now,
        }).execute()

    # Fetch updated payment
    updated_payment = db.table("payments").select("*").eq("id", payment_id).limit(1).execute()
    pay_row = updated_payment.data[0] if updated_payment.data else payment

    return OpenPaymentsCallbackResponse(
        payment=PaymentResponse(
            id=pay_row["id"],
            bill_id=pay_row["bill_id"],
            contributor_name=pay_row["contributor_name"],
            amount_minor=pay_row["amount_minor"],
            currency=pay_row["currency"],
            status=PaymentStatus.COMPLETED,
            payment_reference=pay_row["payment_reference"],
            created_at=pay_row["created_at"],
        ),
        bill_status=new_bill_status,
        received_amount=int(payment_result.get("receive_amount", {}).get("value", 0)),
        message="Payment completed successfully via Open Payments",
    )
