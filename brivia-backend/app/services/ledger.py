"""
Fee math and settlement bookkeeping — the single implementation.

Both the mock provider and the Open Payments callback settle through
``apply_settlement`` so the two paths can no longer drift apart (gap 5) and
every settled contribution lands in the ``platform_fees`` ledger (gap 1).
"""

import secrets
from datetime import datetime, timezone

from app.schema.schemas import BillStatus

# --- Platform fee: 0.3% + ₦50, capped at the contribution amount ---
PLATFORM_FEE_BPS = 30
PLATFORM_FEE_FIXED_MINOR = 5000


def calculate_platform_fee(amount_minor: int) -> int:
    """Brivia's fee in minor units for a contribution of ``amount_minor``."""
    percentage_fee = (amount_minor * PLATFORM_FEE_BPS + 9999) // 10000
    return min(amount_minor, percentage_fee + PLATFORM_FEE_FIXED_MINOR)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_audit(
    db,
    actor_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str,
    metadata: dict | None = None,
) -> None:
    """Write an audit log entry."""
    db.table("audit_logs").insert({
        "id": secrets.token_hex(16),
        "actor_id": actor_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "metadata": metadata,
        "created_at": _now_iso(),
    }).execute()


def record_platform_fee(
    db,
    payment_id: str,
    bill: dict,
    gross_minor: int,
    fee_minor: int,
    net_minor: int,
) -> None:
    """
    Record the accrued fee for a settled contribution.

    The fee physically stays in the receiving wallet until it is swept, so the
    ledger — not the wallet balance — is the source of truth for what Brivia
    has earned. Keyed by payment_id, so a retried settlement cannot double-count.
    """
    if fee_minor <= 0:
        return

    try:
        # The lookup is inside the guard too: on a database without the
        # platform_fees migration this select raises, and it used to take the
        # whole settlement (and therefore the contribution) down with it.
        existing = (
            db.table("platform_fees")
            .select("id")
            .eq("payment_id", payment_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return

        db.table("platform_fees").insert({
            "id": secrets.token_hex(16),
            "payment_id": payment_id,
            "bill_id": bill["id"],
            "provider_id": bill.get("provider_id"),
            "gross_minor": gross_minor,
            "fee_minor": fee_minor,
            "net_minor": net_minor,
            "currency": bill.get("currency", "NGN"),
            "status": "accrued",
            "created_at": _now_iso(),
        }).execute()
    except Exception:
        # Never fail a settled payment because the ledger table is missing.
        log_audit(db, None, "PLATFORM_FEE", "bill", bill["id"], {
            "payment_id": payment_id,
            "gross_amount": gross_minor,
            "platform_fee": fee_minor,
            "net_amount": net_minor,
            "currency": bill.get("currency", "NGN"),
            "ledger": "unavailable",
        })


def apply_settlement(
    db,
    bill: dict,
    payment_id: str,
    gross_amount_minor: int,
    received_amount_minor: int | None = None,
    actor_id: str | None = None,
    currency: str | None = None,
) -> dict:
    """
    Credit a completed contribution to its bill and record the fee.

    Only call this on the transition into COMPLETED — replay protection lives in
    the callers (idempotency key for mock payments, an early COMPLETED return in
    the Open Payments callback).
    """
    settled_minor = (
        gross_amount_minor
        if received_amount_minor is None
        else max(0, int(received_amount_minor))
    )
    fee_minor = min(calculate_platform_fee(gross_amount_minor), settled_minor)
    net_minor = max(settled_minor - fee_minor, 0)

    new_amount_paid = bill["amount_paid_minor"] + net_minor
    new_remaining = max(bill["remaining_balance_minor"] - net_minor, 0)
    new_status = (
        BillStatus.PAID.value if new_remaining <= 0 else BillStatus.PARTIALLY_PAID.value
    )

    db.table("bills").update({
        "amount_paid_minor": new_amount_paid,
        "remaining_balance_minor": new_remaining,
        "status": new_status,
        "updated_at": _now_iso(),
    }).eq("id", bill["id"]).execute()

    record_platform_fee(
        db=db,
        payment_id=payment_id,
        bill=bill,
        gross_minor=gross_amount_minor,
        fee_minor=fee_minor,
        net_minor=net_minor,
    )

    log_audit(db, actor_id, "PAYMENT_COMPLETED", "payment", payment_id, {
        "bill_id": bill["id"],
        "amount_minor": gross_amount_minor,
        "platform_fee": fee_minor,
        "net_amount": net_minor,
        "new_bill_status": new_status,
        "currency": currency or bill.get("currency", "NGN"),
    })

    return {
        "fee_minor": fee_minor,
        "net_minor": net_minor,
        "bill_status": new_status,
        "amount_paid_minor": new_amount_paid,
        "remaining_balance_minor": new_remaining,
    }
