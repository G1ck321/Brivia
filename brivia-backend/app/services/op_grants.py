"""
Durable storage for Open Payments grant continuations (gap 2).

A grant is only useful between the moment the contributor is redirected to
their wallet and the moment they come back. Until now that continuation lived
in ``audit_logs.metadata`` plus an in-memory Map; if the process restarted in
between, an approved payment could never be finalised.

``audit_logs`` stays as a fallback so a deployment that has not run the
migration yet still works exactly as before.
"""

import secrets
from datetime import datetime, timedelta, timezone

from app.config.settings import get_settings


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit_fallback(db, payment_id: str, metadata: dict) -> None:
    db.table("audit_logs").insert({
        "id": secrets.token_hex(16),
        "actor_id": None,
        "action": "OPEN_PAYMENTS_INITIATED",
        "resource_type": "payment",
        "resource_id": payment_id,
        "metadata": metadata,
        "created_at": _now().isoformat(),
    }).execute()


def save_grant(db, payment_id: str, metadata: dict) -> None:
    """Persist a grant continuation for ``payment_id``."""
    settings = get_settings()
    expires_at = _now() + timedelta(minutes=settings.OP_GRANT_TTL_MINUTES)

    try:
        db.table("op_grants").insert({
            "payment_id": payment_id,
            "continue_uri": metadata["continue_uri"],
            "continue_token": metadata["continue_token"],
            "interact_redirect": metadata.get("interact_redirect"),
            "sender_wallet_url": metadata.get("sender_wallet_url"),
            "incoming_payment_id": metadata.get("incoming_payment_id"),
            "quote_id": metadata.get("quote_id"),
            "finish_nonce": metadata.get("finish_nonce"),
            "expires_at": expires_at.isoformat(),
            "created_at": _now().isoformat(),
        }).execute()
    except Exception:
        # Table missing (migration not applied) — keep the old behaviour.
        _audit_fallback(db, payment_id, {**metadata, "grant_store": "audit_logs"})


def load_grant(db, payment_id: str) -> dict | None:
    """Load a still-valid grant, or ``None`` if it is missing/expired/consumed."""
    try:
        result = (
            db.table("op_grants")
            .select("*")
            .eq("payment_id", payment_id)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            if row.get("consumed_at"):
                return None
            expires_at = row.get("expires_at")
            if expires_at:
                parsed = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                if parsed < _now():
                    return None
            return {
                "continue_uri": row["continue_uri"],
                "continue_token": row["continue_token"],
                "interact_redirect": row.get("interact_redirect"),
                "sender_wallet_url": row.get("sender_wallet_url"),
                "incoming_payment_id": row.get("incoming_payment_id"),
                "quote_id": row.get("quote_id"),
                "finish_nonce": row.get("finish_nonce"),
            }
    except Exception:
        pass

    # Fallback: the pre-migration storage location.
    try:
        result = (
            db.table("audit_logs")
            .select("metadata")
            .eq("resource_id", payment_id)
            .eq("action", "OPEN_PAYMENTS_INITIATED")
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["metadata"]
    except Exception:
        pass
    return None


def live_grant_ids(db) -> set[str]:
    """
    Payment ids whose grant can still be continued (unexpired, unconsumed).

    The reconciler uses this as a veto: a payment is never failed while its
    grant is live, because the contributor may still be approving it in their
    wallet. Falls back to the ``audit_logs`` store, which has no explicit
    expiry, so the TTL is derived from ``created_at``.
    """
    try:
        result = (
            db.table("op_grants")
            .select("payment_id, expires_at, consumed_at")
            .gte("expires_at", _now().isoformat())
            .is_("consumed_at", "null")
            .execute()
        )
        return {row["payment_id"] for row in (result.data or []) if row.get("payment_id")}
    except Exception:
        pass

    try:
        cutoff = (
            _now() - timedelta(minutes=get_settings().OP_GRANT_TTL_MINUTES)
        ).isoformat()
        result = (
            db.table("audit_logs")
            .select("resource_id")
            .eq("action", "OPEN_PAYMENTS_INITIATED")
            .gte("created_at", cutoff)
            .execute()
        )
        return {
            row["resource_id"]
            for row in (result.data or [])
            if row.get("resource_id")
        }
    except Exception:
        return set()


def consume_grant(db, payment_id: str) -> None:
    """Mark a grant as used so a replay cannot finalise it twice."""
    try:
        db.table("op_grants").update({
            "consumed_at": _now().isoformat(),
        }).eq("payment_id", payment_id).execute()
    except Exception:
        pass


def purge_expired(db) -> int:
    """Delete grants that can no longer be continued. Returns rows removed."""
    try:
        result = (
            db.table("op_grants")
            .delete()
            .lt("expires_at", _now().isoformat())
            .execute()
        )
        return len(result.data or [])
    except Exception:
        return 0
