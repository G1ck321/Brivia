"""
Background reconciliation (gaps 3 and 4).

Two jobs, both idempotent and cheap:

* ``mark_overdue_bills`` — the ``OVERDUE`` status existed but nothing ever set
  it. Anything past its due date with an outstanding balance flips here.
* ``expire_stale_payments`` — a contributor who approves in their wallet and
  never returns leaves a payment stuck in ``INITIATED`` forever. Once the grant
  TTL has passed it can no longer be continued, so the payment is failed
  explicitly instead of polluting the reconciliation view.

Failing a payment that is *still being approved* would strand a transfer the
contributor has already sanctioned, so the sweep is deliberately conservative:
it waits out a grace period on top of the grant TTL and then skips every payment
that still holds a live, unconsumed grant.

Deliberately *not* attempted: inferring settlement from the receiving wallet.
Guessing that funds arrived would risk crediting a bill twice; settlement stays
with the callback and the Open Payments grant.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from app.config.db import get_supabase
from app.config.settings import get_settings
from app.services.op_grants import live_grant_ids, purge_expired

logger = logging.getLogger(__name__)


def mark_overdue_bills(db) -> int:
    """Flip unpaid, past-due bills to OVERDUE. Returns rows touched."""
    today = date.today().isoformat()
    try:
        result = (
            db.table("bills")
            .update({"status": "OVERDUE", "updated_at": datetime.now(timezone.utc).isoformat()})
            .lt("due_date", today)
            .in_("status", ["ISSUED", "PARTIALLY_PAID"])
            .execute()
        )
        return len(result.data or [])
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("overdue sweep failed: %s", exc)
        return 0


def expire_stale_payments(db) -> int:
    """
    Fail INITIATED payments that can no longer be completed. Rows touched.

    ``updated_at`` is stamped when the grant is created, not when the
    contributor approves, so it says nothing about whether they are still in
    their wallet. Two guards keep that approval alive:

    1. a grace period on top of the grant TTL, and
    2. a hard veto on any payment with a live, unconsumed grant.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    cutoff = (
        now
        - timedelta(
            minutes=settings.OP_GRANT_TTL_MINUTES
            + settings.RECONCILER_PAYMENT_GRACE_MINUTES
        )
    ).isoformat()

    try:
        candidates = (
            db.table("payments")
            .select("id")
            .eq("status", "INITIATED")
            .lt("updated_at", cutoff)
            .execute()
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("stale payment scan failed: %s", exc)
        return 0

    ids = [row["id"] for row in (candidates.data or [])]
    if not ids:
        return 0

    live = live_grant_ids(db)
    stale = [payment_id for payment_id in ids if payment_id not in live]

    if not stale:
        logger.info(
            "reconciler: %d payment(s) past the TTL still hold a live grant; "
            "leaving them for the contributor to finish",
            len(ids),
        )
        return 0

    try:
        result = (
            db.table("payments")
            .update({"status": "FAILED", "updated_at": now.isoformat()})
            .in_("id", stale)
            .execute()
        )
        return len(result.data or [])
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("stale payment sweep failed: %s", exc)
        return 0


def run_once() -> dict:
    """Run every sweep once. Safe to call from a script."""
    db = get_supabase()
    return {
        "overdue_bills": mark_overdue_bills(db),
        "expired_payments": expire_stale_payments(db),
        "purged_grants": purge_expired(db),
    }


async def _loop(stop_event: asyncio.Event) -> None:
    settings = get_settings()
    while not stop_event.is_set():
        try:
            result = await asyncio.to_thread(run_once)
            if any(result.values()):
                logger.info("reconciler: %s", result)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("reconciler run failed: %s", exc)

        try:
            await asyncio.wait_for(
                stop_event.wait(), timeout=settings.RECONCILER_INTERVAL_SECONDS
            )
        except asyncio.TimeoutError:
            continue


def start(stop_event: asyncio.Event) -> asyncio.Task | None:
    """Start the background loop unless disabled by config."""
    if not get_settings().RECONCILER_ENABLED:
        logger.info("reconciler disabled by configuration")
        return None
    return asyncio.create_task(_loop(stop_event))
