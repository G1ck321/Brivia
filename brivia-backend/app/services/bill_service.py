"""
Bill service: create, list, share, and retrieve bills.
"""

import secrets
from datetime import datetime, timedelta, timezone

from app.config.db import get_supabase
from app.config.settings import get_settings
from app.schema.schemas import (
    BillCreate,
    BillResponse,
    BillShareResponse,
    BillStatus,
    PublicBillResponse,
)


def _generate_public_bill_id(settings: Settings | None = None) -> str:
    """Generate a unique BRV-XXXXXXXX public bill ID."""
    if settings is None:
        settings = get_settings()
    suffix = secrets.token_hex(settings.BILL_ID_LENGTH // 2).upper()
    return f"{settings.BILL_ID_PREFIX}{suffix}"


def _share_expiry(settings: "Settings") -> str | None:
    """Expiry for a new share link, or None when links never expire."""
    if settings.SHARE_TOKEN_TTL_DAYS <= 0:
        return None
    return (
        datetime.now(timezone.utc) + timedelta(days=settings.SHARE_TOKEN_TTL_DAYS)
    ).isoformat()


def _generate_share_token(settings: Settings | None = None) -> str:
    """Generate an unpredictable URL-safe share token."""
    if settings is None:
        settings = get_settings()
    return secrets.token_urlsafe(settings.SHARE_TOKEN_LENGTH)


def _bill_row_to_response(row: dict) -> BillResponse:
    """Convert a database row to a BillResponse."""
    return BillResponse(
        id=row["id"],
        public_bill_id=row["public_bill_id"],
        provider_id=row["provider_id"],
        patient_id=row.get("patient_id"),
        patient_name=row["patient_name"],
        description=row["description"],
        amount_minor=row["amount_minor"],
        currency=row["currency"],
        amount_paid_minor=row["amount_paid_minor"],
        remaining_balance_minor=row["remaining_balance_minor"],
        status=BillStatus(row["status"]),
        due_date=row["due_date"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def create_bill(provider_id: str, data: BillCreate) -> BillResponse:
    """Create a new healthcare bill."""
    db = get_supabase()
    settings = get_settings()
    now = datetime.now(timezone.utc).isoformat()

    bill_id = str(secrets.token_hex(16))
    public_bill_id = _generate_public_bill_id(settings)
    share_token = _generate_share_token(settings)

    patient_id = None
    if data.patient_email:
        patient_result = (
            db.table("users")
            .select("id")
            .ilike("email", str(data.patient_email).strip().lower())
            .limit(1)
            .execute()
        )
        if patient_result.data:
            patient_id = patient_result.data[0]["id"]

    bill_record = {
        "id": bill_id,
        "public_bill_id": public_bill_id,
        "provider_id": provider_id,
        "patient_id": patient_id,
        "patient_name": data.patient_name,
        "description": data.description,
        "amount_minor": data.amount_minor,
        "currency": data.currency,
        "amount_paid_minor": 0,
        "remaining_balance_minor": data.amount_minor,
        "status": BillStatus.ISSUED.value,
        "due_date": data.due_date.isoformat(),
        "created_at": now,
        "updated_at": now,
    }

    db.table("bills").insert(bill_record).execute()

    # Create share link
    share_record = {
        "id": str(secrets.token_hex(16)),
        "bill_id": bill_id,
        "share_token": share_token,
        "expires_at": _share_expiry(settings),
        "created_at": now,
    }
    db.table("bill_shares").insert(share_record).execute()

    # Audit log
    _log_audit(db, provider_id, "BILL_CREATED", "bill", bill_id, {"public_bill_id": public_bill_id})

    return _bill_row_to_response(bill_record)


async def get_bills_for_provider(provider_id: str) -> list[BillResponse]:
    """List all bills created by a provider."""
    db = get_supabase()
    result = (
        db.table("bills")
        .select("*")
        .eq("provider_id", provider_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [_bill_row_to_response(row) for row in result.data]


async def get_bills_for_patient(patient_id: str, patient_name: str) -> list[BillResponse]:
    """List bills linked to the patient, with a name fallback for legacy bills.

    Legacy bills predate the ``patient_id`` column and only carry the
    denormalized ``patient_name``, so both conditions have to match. They are
    queried separately and merged instead of using a single PostgREST ``or=``
    filter, which splits its value list on commas and would therefore break for
    names like ``"Okafor, Chidi"`` (and inject unescaped text into the filter).
    """
    db = get_supabase()

    bills_by_id: dict[str, dict] = {}
    for column, value in (("patient_id", patient_id), ("patient_name", patient_name)):
        result = (
            db.table("bills")
            .select("*")
            .eq(column, value)
            .order("created_at", desc=True)
            .execute()
        )
        for row in result.data:
            # A name is not an identity: only fall back to it for legacy bills
            # that have no patient_id yet. A bill explicitly linked to someone
            # else must never surface because two patients share a name.
            linked = row.get("patient_id")
            if column == "patient_name" and linked and linked != patient_id:
                continue
            bills_by_id[row["id"]] = row

    # Both queries are already sorted desc; merge them back into one list.
    merged = sorted(bills_by_id.values(), key=lambda row: row.get("created_at") or "", reverse=True)
    return [_bill_row_to_response(row) for row in merged]


def can_access_bill(bill, user: dict) -> bool:
    """Whether ``user`` may read this bill and its payment history.

    Accepts a ``BillResponse`` or a raw database row. Providers see their own
    bills; a patient sees bills linked to their account, plus legacy bills that
    only carry their name and were never linked. Everyone else is refused.
    """

    def field(name: str):
        return bill.get(name) if isinstance(bill, dict) else getattr(bill, name, None)

    if user.get("role") == "admin":
        return True
    if field("provider_id") == user.get("id"):
        return True
    if user.get("role") != "patient":
        return False

    linked = field("patient_id")
    if linked == user.get("id"):
        return True

    name_match = (field("patient_name") or "").strip().casefold() == (
        user.get("name") or ""
    ).strip().casefold()
    return linked is None and bool(name_match)


async def get_bill_by_id(bill_id: str) -> BillResponse | None:
    """Get a single bill by its internal ID."""
    db = get_supabase()
    result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not result.data:
        return None
    return _bill_row_to_response(result.data[0])


async def get_bill_by_public_id(public_bill_id: str) -> BillResponse | None:
    """Get a bill by its public BRV-XXXXXXXX ID."""
    db = get_supabase()
    result = (
        db.table("bills").select("*").eq("public_bill_id", public_bill_id).limit(1).execute()
    )
    if not result.data:
        return None
    return _bill_row_to_response(result.data[0])


async def create_share_link(bill_id: str) -> BillShareResponse:
    """Generate a new shareable link for a bill."""
    db = get_supabase()
    settings = get_settings()
    now = datetime.now(timezone.utc).isoformat()

    share_token = _generate_share_token(settings)

    share_record = {
        "id": str(secrets.token_hex(16)),
        "bill_id": bill_id,
        "share_token": share_token,
        "expires_at": _share_expiry(settings),
        "created_at": now,
    }

    db.table("bill_shares").insert(share_record).execute()

    base_url = settings.CORS_ORIGINS.split(",")[0] if settings.CORS_ORIGINS else "http://localhost:3000"

    return BillShareResponse(
        share_token=share_token,
        share_url=f"{base_url}/pay/{share_token}",
        bill_id=bill_id,
    )


async def revoke_share_links(bill_id: str) -> int:
    """Revoke every public link for a bill. Returns the number removed."""
    db = get_supabase()
    result = db.table("bill_shares").delete().eq("bill_id", bill_id).execute()
    return len(result.data or [])


async def get_public_bill_by_token(share_token: str) -> tuple[PublicBillResponse, str] | None:
    """
    Get public bill info via a share token.
    Returns (PublicBillResponse, bill_id) or None.
    """
    db = get_supabase()

    share_result = (
        db.table("bill_shares")
        .select("*")
        .eq("share_token", share_token)
        .limit(1)
        .execute()
    )

    if not share_result.data:
        return None

    share = share_result.data[0]

    # A share link can now expire; an expired link behaves like a missing one.
    expires_at = share.get("expires_at")
    if expires_at:
        try:
            parsed = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        except ValueError:
            parsed = None
        if parsed and parsed < datetime.now(timezone.utc):
            return None

    bill_id = share["bill_id"]

    bill_result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not bill_result.data:
        return None

    bill = bill_result.data[0]

    # Get provider name
    provider_result = (
        db.table("users").select("name, facility_name").eq("id", bill["provider_id"]).limit(1).execute()
    )
    # facility_name is nullable, and a provider can register without one. Passing
    # None into PublicBillResponse (which requires a string) used to 500 the
    # whole care page and every quote for that bill.
    provider = provider_result.data[0] if provider_result.data else {}
    provider_name = (provider.get("name") or "Unknown").strip() or "Unknown"
    facility_name = (provider.get("facility_name") or "").strip() or provider_name

    return PublicBillResponse(
        public_bill_id=bill["public_bill_id"],
        provider_name=provider_name,
        facility_name=facility_name,
        description=bill["description"],
        amount_minor=bill["amount_minor"],
        currency=bill["currency"],
        amount_paid_minor=bill["amount_paid_minor"],
        remaining_balance_minor=bill["remaining_balance_minor"],
        status=BillStatus(bill["status"]),
        due_date=bill["due_date"],
    ), bill_id


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
