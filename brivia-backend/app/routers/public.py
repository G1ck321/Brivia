"""Public router: unauthenticated endpoints for bill sharing and contributor payments."""

import logging
import asyncio
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.config import schema
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
from app.services.ledger import apply_settlement, calculate_platform_fee
from app.services.payment_service import initiate_contribution
from app.services.op_grants import consume_grant, load_grant, save_grant
from app.services.ratelimit import public_rate_limit
from app.services.wallets import resolve_receiving_wallet
from app.services.v2.lines import allocate_for_payment
from app.config.settings import get_settings
from app.services.open_payments_client import get_op_server_url

logger = logging.getLogger(__name__)

# The callback page polls this router every couple of seconds while a wallet
# approval settles, and it is the redirect target the authorization server hits.
# It therefore uses the read bucket; the two endpoints that create money work
# keep the tighter write limit explicitly.
public_read_limit = public_rate_limit("public-read")
public_write_limit = public_rate_limit("public-write")

# Multiple browser polls or strict-mode effect retries must not continue the
# same GNAP grant concurrently. Keep the lock for the life of the worker.
callback_locks: dict[str, asyncio.Lock] = {}

router = APIRouter(
    prefix="/public",
    tags=["Public"],
    dependencies=[Depends(public_read_limit)],
)


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


@router.post(
    "/bills/{share_token}/pay",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(public_write_limit)],
)
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

@router.post(
    "/bills/{share_token}/pay/open-payments",
    response_model=OpenPaymentsInitiateResponse,
    dependencies=[Depends(public_write_limit)],
)
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
        receiver_wallet = resolve_receiving_wallet(bill)
        if not receiver_wallet:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OP_RECEIVING_WALLET_URL is not configured."
            )
        try:
            import httpx
            op_url = get_op_server_url()
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
                detail=f"Failed to set up incoming payment: "
            )

    # Create payment record
    payment_id = str(secrets.token_hex(16))
    payment_ref = f"BRV-PAY-{secrets.token_hex(6).upper()}"

    # A database created before the v2 migration has no payments.line_id, and
    # PostgREST rejects the whole insert over an unknown column even when the
    # value is null. Record the claim only when the column exists; the bill
    # still settles either way.
    supports_lines = schema.payments_support_lines(db)
    effective_line_id = data.line_id if supports_lines else None
    if data.line_id and not supports_lines:
        logger.warning(
            "line_id %s requested but payments.line_id is missing; "
            "run migrations/v2_care_circle.sql to record line claims",
            data.line_id,
        )

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
    if supports_lines:
        payment_record["line_id"] = effective_line_id
    db.table("payments").insert(payment_record).execute()

    # Initiate outgoing payment grant via OP server
    # The authorization server redirects the contributor's browser back to this
    # exact URL once they approve, so it must identify the payment.
    frontend_origin = (settings.CORS_ORIGINS.split(",")[0] or "").strip().rstrip("/")
    callback_url = f"{frontend_origin}/pay/{share_token}/callback?payment_id={payment_id}"
    try:
        import httpx
        op_url = get_op_server_url()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{op_url}/initiate-outgoing",
                json={
                    "sender_wallet_url": data.sender_wallet_url,
                    "incoming_payment_url": incoming_payment_id,
                    "amount_minor": data.amount_minor,
                    "callback_url": callback_url,
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

    # Durable grant continuation (op_grants, with audit_logs as fallback)
    save_grant(db, payment_id, {
        "continue_uri": grant_result["continue_uri"],
        "continue_token": grant_result["continue_token"],
        "interact_redirect": grant_result.get("interact_redirect"),
        "quote_id": grant_result.get("quote_id"),
        "bill_id": bill_id,
        "incoming_payment_id": incoming_payment_id,
        "sender_wallet_url": data.sender_wallet_url,
        "callback_url": callback_url,
        "finish_nonce": grant_result.get("finish_nonce"),
    })

    return OpenPaymentsInitiateResponse(
        payment_id=payment_id,
        redirect_url=grant_result["interact_redirect"],
        message="Open this URL to approve the payment in your wallet",
    )


@router.get("/bills/{share_token}/pay/callback", response_model=OpenPaymentsCallbackResponse)
async def open_payments_callback(
    share_token: str,
    payment_id: str = Query(...),
    interact_ref: str | None = Query(None),
    interact_hash: str | None = Query(None),
    hash: str | None = Query(None),
):
    """
    Callback after user approves the payment in their wallet.
    Finalizes the grant and executes the outgoing payment.

    ``interact_ref`` is the interaction reference the authorization server
    appends to the finish redirect. It is required by GNAP when continuing an
    interactive grant — without it the AS answers ``invalid_interaction``.
    """
    lock = callback_locks.setdefault(payment_id, asyncio.Lock())
    async with lock:
        settings = get_settings()
        db = get_supabase()
        now = datetime.now(timezone.utc).isoformat()

        result = await get_public_bill_by_token(share_token)
        if not result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid bill link.")

        _, bill_id = result

        payment_result = db.table("payments").select("*").eq("id", payment_id).limit(1).execute()
        if not payment_result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")

        payment = payment_result.data[0]

        if payment["status"] == PaymentStatus.COMPLETED.value:
            updated_bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
            bill_status = updated_bill_result.data[0]["status"] if updated_bill_result.data else "ISSUED"
            platform_fee = calculate_platform_fee(payment["amount_minor"])
            net_amount = payment["amount_minor"] - platform_fee
            return OpenPaymentsCallbackResponse(
                payment=PaymentResponse(
                    id=payment["id"],
                    bill_id=payment["bill_id"],
                    contributor_name=payment["contributor_name"],
                    amount_minor=payment["amount_minor"],
                    currency=payment["currency"],
                    status=PaymentStatus.COMPLETED,
                    payment_reference=payment["payment_reference"],
                    created_at=payment["created_at"],
                ),
                bill_status=bill_status,
                received_amount=payment["amount_minor"],
                gross_amount=payment["amount_minor"],
                platform_fee=platform_fee,
                net_amount=net_amount,
                message="Payment already completed",
            )

        metadata = load_grant(db, payment_id)
        op_payment_result = None
        incoming_payment_id = None

        if payment["status"] == PaymentStatus.FAILED.value:
            if not metadata:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This payment has already failed. Please try making a new contribution.",
                )
            db.table("payments").update({
                "status": PaymentStatus.INITIATED.value,
                "updated_at": now,
            }).eq("id", payment_id).execute()
            payment["status"] = PaymentStatus.INITIATED.value

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Grant details not found or expired. Please try again.",
            )

        incoming_payment_id = metadata["incoming_payment_id"]
        sender_wallet_url = metadata["sender_wallet_url"]

        if not payment.get("external_payment_id"):
            if not interact_ref:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Wallet authorization is still being confirmed. Please wait.",
                )
            try:
                import httpx
                op_url = get_op_server_url()
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        f"{op_url}/finalize-payment",
                        json={
                            "continue_uri": metadata["continue_uri"],
                            "continue_token": metadata["continue_token"],
                            "sender_wallet_url": sender_wallet_url,
                            "incoming_payment_id": incoming_payment_id,
                            "amount_minor": payment["amount_minor"],
                            "description": "Brivia bill contribution",
                            "interact_ref": interact_ref,
                        },
                    )
                    resp.raise_for_status()
                    op_payment_result = resp.json()
            except HTTPException:
                raise
            except Exception as exc:
                logger.warning("Payment %s is awaiting finalization: %s", payment_id, exc)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Payment is still being processed by the wallet network. Please wait.",
                )

            if op_payment_result.get("failed"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="The outgoing payment has not settled. Please wait.",
                )

            db.table("payments").update({
                "external_payment_id": op_payment_result.get("payment_id"),
                "updated_at": now,
            }).eq("id", payment_id).execute()

        received_amount = 0
        receive_amount = op_payment_result.get("receive_amount") if op_payment_result else None
        if isinstance(receive_amount, dict):
            received_amount = int(receive_amount.get("value") or 0)

        if received_amount <= 0:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=70.0) as client:
                    poll_resp = await client.post(
                        f"{get_op_server_url()}/poll-settlement",
                        json={
                            "incoming_payment_url": incoming_payment_id,
                            "max_attempts": 30,
                            "interval_ms": 2000,
                        },
                    )
                    poll_resp.raise_for_status()
                    poll_result = poll_resp.json()
                if poll_result.get("status") == "completed":
                    polled_amount = poll_result.get("received_amount")
                    if isinstance(polled_amount, dict):
                        received_amount = int(polled_amount.get("value") or 0)
            except Exception as exc:
                logger.warning("Settlement polling failed for payment %s: %s", payment_id, exc)

        if received_amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payment was sent but the network is still settling. Please wait.",
            )

        current_bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
        if not current_bill_result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found.")

        settlement = apply_settlement(
            db=db,
            bill=current_bill_result.data[0],
            payment_id=payment_id,
            gross_amount_minor=payment["amount_minor"],
            received_amount_minor=received_amount,
            actor_id=None,
            currency=payment.get("currency"),
        )
        platform_fee = settlement["fee_minor"]
        net_amount = settlement["net_minor"]
        new_bill_status = settlement["bill_status"]

        if payment.get("line_id"):
            allocate_for_payment(db, bill_id, payment["line_id"], net_amount)

        consume_grant(db, payment_id)

        external_payment_id = (
            op_payment_result.get("payment_id")
            if op_payment_result
            else payment.get("external_payment_id")
        )
        db.table("payments").update({
            "status": PaymentStatus.COMPLETED.value,
            "external_payment_id": external_payment_id,
            "updated_at": now,
        }).eq("id", payment_id).execute()

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
            received_amount=received_amount,
            gross_amount=payment["amount_minor"],
            platform_fee=platform_fee,
            net_amount=net_amount,
            message="Payment completed successfully via Open Payments",
        )
