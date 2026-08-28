"""
Payment service: initiate, verify, record payments.
Implements the payment abstraction layer from the spec.

PaymentProvider → OpenPaymentsProvider → MockPaymentProvider (for MVP).
"""

import secrets
from datetime import datetime, timezone

from app.config.db import get_supabase
from app.config.settings import get_settings
from app.schema.schemas import (
    PaymentCreate,
    PaymentResponse,
    PaymentStatus,
    BillStatus,
)


class PaymentProvider:
    """Base payment provider interface."""

    async def initiate_payment(self, amount_minor: int, currency: str, reference: str) -> dict:
        raise NotImplementedError

    async def verify_payment(self, external_id: str) -> dict:
        raise NotImplementedError


# --- Platform fee ---
PLATFORM_FEE_PERCENT = 2  # 2% goes to Brivia


def calculate_platform_fee(amount_minor: int) -> int:
    """Calculate the Brivia platform fee (2% of the contribution)."""
    return max(int(amount_minor * PLATFORM_FEE_PERCENT / 100), 1)  # minimum 1 unit


class MockPaymentProvider(PaymentProvider):
    """
    Mock payment provider for demo/MVP mode.
    Always succeeds after a brief delay. Clearly labelled as non-real.
    """

    async def initiate_payment(self, amount_minor: int, currency: str, reference: str) -> dict:
        external_id = f"MOCK-{secrets.token_hex(8).upper()}"
        return {
            "status": "completed",
            "external_payment_id": external_id,
            "message": "Demo payment processed",
        }

    async def verify_payment(self, external_id: str) -> dict:
        return {
            "status": "completed",
            "external_payment_id": external_id,
            "verified": True,
        }


def _get_provider() -> PaymentProvider:
    """Get the configured payment provider."""
    settings = get_settings()
    if settings.PAYMENT_PROVIDER == "mock":
        return MockPaymentProvider()
    if settings.PAYMENT_PROVIDER == "openpayments":
        from app.services.open_payments_provider import OpenPaymentsProvider
        return OpenPaymentsProvider()
    return MockPaymentProvider()


def _generate_payment_reference() -> str:
    """Generate a unique payment reference."""
    return f"BRV-PAY-{secrets.token_hex(6).upper()}"


def _payment_row_to_response(row: dict) -> PaymentResponse:
    """Convert a database row to a PaymentResponse."""
    return PaymentResponse(
        id=row["id"],
        bill_id=row["bill_id"],
        contributor_name=row["contributor_name"],
        amount_minor=row["amount_minor"],
        currency=row["currency"],
        status=PaymentStatus(row["status"]),
        payment_reference=row["payment_reference"],
        created_at=row["created_at"],
    )


async def initiate_contribution(
    bill_id: str,
    data: PaymentCreate,
    contributor_id: str | None = None,
) -> PaymentResponse:
    """
    Initiate a payment contribution to a bill.
    Validates idempotency, amount limits, and processes payment.
    """
    db = get_supabase()
    settings = get_settings()
    now = datetime.now(timezone.utc).isoformat()

    # --- Idempotency check ---
    existing = (
        db.table("payments")
        .select("id")
        .eq("idempotency_key", data.idempotency_key)
        .limit(1)
        .execute()
    )
    if existing.data:
        # Replay: return the existing payment
        full = (
            db.table("payments")
            .select("*")
            .eq("id", existing.data[0]["id"])
            .limit(1)
            .execute()
        )
        return _payment_row_to_response(full.data[0])

    # --- Fetch and validate bill ---
    bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not bill_result.data:
        raise ValueError("Bill not found.")

    bill = bill_result.data[0]

    if bill["status"] == BillStatus.PAID.value:
        raise ValueError("This bill is already fully funded.")

    if bill["status"] == BillStatus.CANCELLED.value:
        raise ValueError("This bill has been cancelled.")

    if data.amount_minor > bill["remaining_balance_minor"]:
        raise ValueError(
            f"Amount exceeds remaining balance of {bill['remaining_balance_minor']} {bill['currency']}."
        )

    # --- Calculate platform fee (2% to Brivia) ---
    platform_fee = calculate_platform_fee(data.amount_minor)
    net_amount = data.amount_minor - platform_fee

    # --- Create payment record ---
    payment_id = str(secrets.token_hex(16))
    payment_ref = _generate_payment_reference()

    payment_record = {
        "id": payment_id,
        "bill_id": bill_id,
        "contributor_id": contributor_id,
        "contributor_name": data.contributor_name,
        "amount_minor": data.amount_minor,
        "currency": bill["currency"],
        "status": PaymentStatus.CREATED.value,
        "payment_reference": payment_ref,
        "external_payment_id": None,
        "idempotency_key": data.idempotency_key,
        "created_at": now,
        "updated_at": now,
    }

    db.table("payments").insert(payment_record).execute()

    # Audit: payment created
    _log_audit(db, contributor_id, "PAYMENT_CREATED", "payment", payment_id, {
        "bill_id": bill_id,
        "amount_minor": data.amount_minor,
    })

    # --- Process through payment provider ---
    provider = _get_provider()
    try:
        result = await provider.initiate_payment(
            amount_minor=data.amount_minor,
            currency=bill["currency"],
            reference=payment_ref,
        )
        external_id = result.get("external_payment_id")
        provider_status = result.get("status", "failed")

        if provider_status == "completed":
            payment_status = PaymentStatus.COMPLETED
        else:
            payment_status = PaymentStatus.FAILED

    except Exception:
        payment_status = PaymentStatus.FAILED
        external_id = None

    # --- Update payment record ---
    # Bill tracks net amount (after platform fee) as the amount paid
    new_amount_paid = bill["amount_paid_minor"] + net_amount
    new_remaining = bill["remaining_balance_minor"] - net_amount

    if payment_status == PaymentStatus.COMPLETED:
        # Update bill — only count net amount (after platform fee) toward the bill
        new_bill_status = BillStatus.PAID.value if new_remaining <= 0 else BillStatus.PARTIALLY_PAID.value

        db.table("bills").update({
            "amount_paid_minor": new_amount_paid,
            "remaining_balance_minor": max(new_remaining, 0),
            "status": new_bill_status,
            "updated_at": now,
        }).eq("id", bill_id).execute()

        # Record platform fee for Brivia
        if platform_fee > 0:
            _log_audit(db, None, "PLATFORM_FEE", "bill", bill_id, {
                "payment_id": payment_id,
                "gross_amount": data.amount_minor,
                "platform_fee": platform_fee,
                "net_amount": net_amount,
                "currency": bill["currency"],
            })

        # Audit: payment completed
        _log_audit(db, contributor_id, "PAYMENT_COMPLETED", "payment", payment_id, {
            "bill_id": bill_id,
            "amount_minor": data.amount_minor,
            "new_bill_status": new_bill_status,
        })

    # Update payment status
    db.table("payments").update({
        "status": payment_status.value,
        "external_payment_id": external_id,
        "updated_at": now,
    }).eq("id", payment_id).execute()

    # Fetch updated payment
    updated = db.table("payments").select("*").eq("id", payment_id).limit(1).execute()
    return _payment_row_to_response(updated.data[0])


async def get_payments_for_bill(bill_id: str) -> list[PaymentResponse]:
    """List all payments for a bill."""
    db = get_supabase()
    result = (
        db.table("payments")
        .select("*")
        .eq("bill_id", bill_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [_payment_row_to_response(row) for row in result.data]


async def get_payment_by_id(payment_id: str) -> PaymentResponse | None:
    """Get a single payment by ID."""
    db = get_supabase()
    result = db.table("payments").select("*").eq("id", payment_id).limit(1).execute()
    if not result.data:
        return None
    return _payment_row_to_response(result.data[0])


# --- Open Payments specific functions ---

async def create_incoming_payment_for_bill(
    bill_id: str,
    receiver_wallet_url: str | None = None,
) -> dict:
    """
    Create an incoming payment on the receiver's wallet for a bill.
    Used when the provider creates a bill to set up where payments land.
    """
    db = get_supabase()
    bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not bill_result.data:
        raise ValueError("Bill not found.")

    bill = bill_result.data[0]
    provider = _get_provider()

    if not hasattr(provider, 'initiate_payment') or not hasattr(provider, 'poll_incoming_payment'):
        raise ValueError("Current payment provider does not support incoming payments.")

    result = await provider.initiate_payment(
        amount_minor=bill["amount_minor"],
        currency=bill["currency"],
        reference=bill["public_bill_id"],
        receiver_wallet_url=receiver_wallet_url,
    )

    # Store the incoming payment ID on the bill
    db.table("bills").update({
        "external_payment_id": result.get("incoming_payment_id"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", bill_id).execute()

    return result


async def create_outgoing_grant(
    bill_id: str,
    sender_wallet_url: str,
    amount_minor: int,
) -> dict:
    """
    Create an outgoing payment grant for a contributor.
    Returns a URL the contributor must visit to approve the payment.
    """
    db = get_supabase()
    bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not bill_result.data:
        raise ValueError("Bill not found.")

    bill = bill_result.data[0]
    provider = _get_provider()

    if not hasattr(provider, 'create_outgoing_payment_grant'):
        raise ValueError("Current payment provider does not support outgoing grants.")

    # Get the incoming payment ID from the bill
    incoming_payment_id = bill.get("external_payment_id")
    if not incoming_payment_id:
        raise ValueError("Bill does not have an incoming payment set up.")

    result = await provider.create_outgoing_payment_grant(
        sender_wallet_url=sender_wallet_url,
        amount_minor=amount_minor,
    )

    # Store grant details for later continuation
    payment_id = str(secrets.token_hex(16))
    now = datetime.now(timezone.utc).isoformat()

    db.table("payments").insert({
        "id": payment_id,
        "bill_id": bill_id,
        "contributor_id": None,
        "contributor_name": "Open Payments contributor",
        "amount_minor": amount_minor,
        "currency": bill["currency"],
        "status": PaymentStatus.INITIATED.value,
        "payment_reference": _generate_payment_reference(),
        "external_payment_id": None,
        "idempotency_key": secrets.token_hex(16),
        "created_at": now,
        "updated_at": now,
    }).execute()

    # Store grant continuation details
    db.table("audit_logs").insert({
        "id": str(secrets.token_hex(16)),
        "actor_id": None,
        "action": "OUTGOING_GRANT_CREATED",
        "resource_type": "payment",
        "resource_id": payment_id,
        "metadata": {
            "continue_uri": result["continue_uri"],
            "continue_token": result["continue_token"],
            "interact_redirect": result["interact_redirect"],
            "bill_id": bill_id,
            "incoming_payment_id": incoming_payment_id,
        },
        "created_at": now,
    }).execute()

    return {
        "payment_id": payment_id,
        "interact_redirect": result["interact_redirect"],
        "message": "Open this URL to approve the payment",
    }


async def finalize_and_execute_payment(
    payment_id: str,
    continue_uri: str,
    continue_token: str,
    sender_wallet_url: str,
) -> dict:
    """
    Finalize the grant after user approval and execute the outgoing payment.
    """
    db = get_supabase()
    provider = _get_provider()

    # Get payment record
    payment_result = db.table("payments").select("*").eq("id", payment_id).limit(1).execute()
    if not payment_result.data:
        raise ValueError("Payment not found.")

    payment = payment_result.data[0]
    bill_id = payment["bill_id"]

    # Get bill for incoming payment ID
    bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not bill_result.data:
        raise ValueError("Bill not found.")

    bill = bill_result.data[0]
    incoming_payment_id = bill.get("external_payment_id")
    if not incoming_payment_id:
        raise ValueError("No incoming payment found for this bill.")

    # Finalize grant
    grant_result = await provider.finalize_outgoing_payment_grant(
        continue_uri=continue_uri,
        continue_token=continue_token,
    )

    # Execute outgoing payment
    payment_result = await provider.execute_outgoing_payment(
        sender_wallet_url=sender_wallet_url,
        access_token=grant_result["access_token"],
        incoming_payment_id=incoming_payment_id,
        amount_minor=payment["amount_minor"],
        description=f"Brivia bill {bill['public_bill_id']}",
    )

    # Update payment record
    now = datetime.now(timezone.utc).isoformat()
    db.table("payments").update({
        "status": PaymentStatus.COMPLETED.value,
        "external_payment_id": payment_result["external_payment_id"],
        "updated_at": now,
    }).eq("id", payment_id).execute()

    # Update bill
    new_amount_paid = bill["amount_paid_minor"] + payment["amount_minor"]
    new_remaining = bill["remaining_balance_minor"] - payment["amount_minor"]
    new_bill_status = BillStatus.PAID.value if new_remaining <= 0 else BillStatus.PARTIALLY_PAID.value

    db.table("bills").update({
        "amount_paid_minor": new_amount_paid,
        "remaining_balance_minor": max(new_remaining, 0),
        "status": new_bill_status,
        "updated_at": now,
    }).eq("id", bill_id).execute()

    return {
        "status": "completed",
        "payment_id": payment_id,
        "received_amount": payment_result.get("receive_amount"),
    }


async def poll_payment_settlement(
    bill_id: str,
    max_attempts: int = 30,
) -> dict:
    """
    Poll the incoming payment to check if funds have arrived.
    """
    db = get_supabase()
    provider = _get_provider()

    bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not bill_result.data:
        raise ValueError("Bill not found.")

    bill = bill_result.data[0]
    incoming_payment_id = bill.get("external_payment_id")
    if not incoming_payment_id:
        raise ValueError("No incoming payment to poll.")

    if not hasattr(provider, 'poll_incoming_payment'):
        raise ValueError("Current payment provider does not support polling.")

    return await provider.poll_incoming_payment(
        incoming_payment_id=incoming_payment_id,
        max_attempts=max_attempts,
    )


def _log_audit(
    db, actor_id: str | None, action: str, resource_type: str, resource_id: str, metadata: dict | None = None
) -> None:
    """Write an audit log entry."""
    now = datetime.now(timezone.utc).isoformat()
    db.table("audit_logs").insert({
        "id": str(secrets.token_hex(16)),
        "actor_id": actor_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "metadata": metadata,
        "created_at": now,
    }).execute()
