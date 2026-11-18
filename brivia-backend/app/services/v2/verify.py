"""
Bill verification (FR-8) — the answer to "how can a patient bill be altered?"

The provider signs a canonical digest of the fields a contributor relies on:
public bill id, total, currency, due date and provider id. Anyone holding the
share link can then ask whether the bill still matches what was signed, so a
tampered total, swapped due date or edited line total shows up as unverified.

HMAC with the deployment's JWT secret keeps this zero-dependency and keyless to
operate. Ed25519 with per-provider keys is the production upgrade.
"""

import hashlib
import hmac
from datetime import datetime, timezone

from app.config import schema
from app.config.settings import get_settings


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def payload_for(bill: dict) -> str:
    """Canonical signed payload. Any change to these fields breaks the seal."""
    return "|".join([
        str(bill["public_bill_id"]),
        str(int(bill["amount_minor"])),
        str(bill.get("currency") or "NGN"),
        str(bill.get("due_date") or ""),
        str(bill.get("provider_id") or ""),
    ])


def _digest(bill: dict) -> tuple[str, str]:
    payload = payload_for(bill).encode()
    key = get_settings().JWT_SECRET_KEY.encode()
    return hashlib.sha256(payload).hexdigest(), hmac.new(key, payload, hashlib.sha256).hexdigest()


def sign_bill(db, bill: dict) -> dict:
    """Sign (or re-sign) a bill. Provider-only, enforced by the router."""
    if not schema.has_table(db, "bill_verifications"):
        raise ValueError(
            "Bill sealing needs the v2 migration. Run "
            "brivia-backend/migrations/v2_care_circle.sql in the Supabase SQL editor."
        )

    payload_hash, signature = _digest(bill)
    now = _now_iso()

    record = {
        "bill_id": bill["id"],
        "payload_hash": payload_hash,
        "signature": signature,
        "algorithm": "HMAC-SHA256",
        "created_at": now,
    }

    try:
        db.table("bill_verifications").insert(record).execute()
    except Exception:
        db.table("bill_verifications").update({
            "payload_hash": payload_hash,
            "signature": signature,
            "algorithm": "HMAC-SHA256",
            "created_at": now,
        }).eq("bill_id", bill["id"]).execute()

    return {
        "verified": True,
        "algorithm": "HMAC-SHA256",
        "signed_at": now,
        "payload_hash": payload_hash,
        "note": "Bill signed. Contributors can now check it against this seal.",
    }


def verify_bill(db, bill: dict) -> dict:
    """Check the stored seal against the bill's current values."""
    try:
        result = (
            db.table("bill_verifications")
            .select("*")
            .eq("bill_id", bill["id"])
            .limit(1)
            .execute()
        )
    except Exception:
        return {
            "verified": False,
            "algorithm": None,
            "signed_at": None,
            "payload_hash": None,
            "note": "Verification is not configured on this deployment.",
        }

    if not result.data:
        return {
            "verified": False,
            "algorithm": None,
            "signed_at": None,
            "payload_hash": None,
            "note": "This bill has no provider seal yet.",
        }

    row = result.data[0]
    payload_hash, signature = _digest(bill)
    matches = hmac.compare_digest(signature, row["signature"])

    return {
        "verified": matches,
        "algorithm": row.get("algorithm"),
        "signed_at": row.get("created_at"),
        "payload_hash": row.get("payload_hash"),
        "note": (
            "Bill details match the provider's seal."
            if matches
            else "These bill details no longer match the provider's seal. Do not pay."
        ),
    }
