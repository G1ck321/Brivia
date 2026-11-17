"""
Background reconciliation (gaps 3 and 4).

Two jobs, both idempotent and cheap:

* ``mark_overdue_bills`` — the ``OVERDUE`` status existed but nothing ever set
  it. Anything past its due date with an outstanding balance flips here.
* ``expire_stale_payments`` — a contributor who approves in their wallet and
  never returns leaves a payment stuck in ``INITIATED`` forever. Once the grant
  TTL has passed it can no longer be continued, so the payment is failed
  explicitly instead of polluting the reconciliation view.

Deliberately *not* attempted: inferring settlement from the receiving wallet.
Guessing that funds arrived would risk crediting a bill twice; settlement stays
with the callback and the Open Payments grant.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from app.config.db import get_supabase
from app.config.settings import get_settings
from app.services.op_grants import purge_expired

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
    """Fail INITIATED payments whose grant TTL has elapsed. Returns rows touched."""
    settings = get_settings()
    cutoff = (
        datetime.now(timezone.utc) - timedelta(minutes=settings.OP_GRANT_TTL_MINUTES)
    ).isoformat()
    try:
        result = (
            db.table("payments")
            .update({"status": "FAILED", "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("status", "INITIATED")
            .lt("updated_at", cutoff)
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
