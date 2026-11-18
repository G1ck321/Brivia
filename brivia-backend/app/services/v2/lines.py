"""
Itemised bills (FR-1), claim allocation (FR-2/FR-4) and the circle feed (FR-5).

A line is the unit of intent: "Lab panel, ₦18,000". Contributions are allocated
to the line they were claimed against; the bill total is still the source of
truth and lines are validated to sum to it.
"""

import secrets
from datetime import datetime, timezone

from app.config import schema
from app.config.db import get_supabase


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalise(row: dict) -> dict:
    amount = int(row["amount_minor"])
    funded = int(row.get("funded_minor") or 0)
    return {
        "id": row["id"],
        "label": row["label"],
        "amount_minor": amount,
        "funded_minor": funded,
        "remaining_minor": max(amount - funded, 0),
        "position": int(row.get("position") or 0),
    }


def get_lines(db, bill_id: str) -> list[dict]:
    """All lines for a bill, ordered, with derived remaining amounts."""
    if not schema.has_table(db, "bill_lines"):
        # Itemisation has not been migrated in; the bill is still valid, it just
        # has no itemised view yet.
        return []
    result = (
        db.table("bill_lines")
        .select("*")
        .eq("bill_id", bill_id)
        .order("position")
        .execute()
    )
    return [_normalise(row) for row in (result.data or [])]


def replace_lines(db, bill: dict, lines: list[dict]) -> list[dict]:
    """
    Replace a bill's lines. Only allowed before any money has been received,
    so a provider cannot re-cut a partially funded bill.
    """
    if int(bill.get("amount_paid_minor") or 0) > 0:
        raise ValueError(
            "This bill already has contributions. Create a new bill to itemise it."
        )

    total = sum(int(line["amount_minor"]) for line in lines)
    if total != int(bill["amount_minor"]):
        raise ValueError(
            f"Line items total {total} but the bill is {bill['amount_minor']}; "
            "they must match exactly."
        )

    db.table("bill_lines").delete().eq("bill_id", bill["id"]).execute()

    rows = []
    for index, line in enumerate(lines):
        rows.append({
            "id": secrets.token_hex(16),
            "bill_id": bill["id"],
            "label": str(line["label"]).strip(),
            "amount_minor": int(line["amount_minor"]),
            "funded_minor": 0,
            "position": index,
            "created_at": _now_iso(),
        })

    db.table("bill_lines").insert(rows).execute()
    return get_lines(db, bill["id"])


def get_line(db, bill_id: str, line_id: str) -> dict | None:
    if not schema.has_table(db, "bill_lines"):
        return None
    result = (
        db.table("bill_lines")
        .select("*")
        .eq("id", line_id)
        .eq("bill_id", bill_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return _normalise(result.data[0])


def allocate_for_payment(db, bill_id: str, line_id: str | None, net_minor: int) -> dict | None:
    """
    Credit a settled contribution's net amount to its line.

    Capped at the line amount: if a contribution overshoots (possible when two
    people claim the same line at once) the excess still counts toward the bill,
    it just does not push the line past 100%.
    """
    if not line_id or net_minor <= 0:
        return None

    line = get_line(db, bill_id, line_id)
    if not line:
        return None

    new_funded = min(line["amount_minor"], line["funded_minor"] + net_minor)
    db.table("bill_lines").update({"funded_minor": new_funded}).eq("id", line_id).execute()

    return {
        "line_id": line_id,
        "label": line["label"],
        "funded_minor": new_funded,
        "amount_minor": line["amount_minor"],
    }


def circle(db, bill_id: str, limit: int = 20) -> list[dict]:
    """Recent settled contributions, newest first, with their line label."""
    # Selecting line_id on a pre-v2 database fails the whole query, which would
    # take the care page down with it.
    columns = "contributor_name, amount_minor, created_at, status"
    if schema.payments_support_lines(db):
        columns += ", line_id"

    result = (
        db.table("payments")
        .select(columns)
        .eq("bill_id", bill_id)
        .eq("status", "COMPLETED")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    labels = {line["id"]: line["label"] for line in get_lines(db, bill_id)}

    entries = []
    for row in result.data or []:
        name = (row.get("contributor_name") or "Anonymous").strip() or "Anonymous"
        initials = "".join(part[0] for part in name.split()[:2]).upper() or "A"
        entries.append({
            "contributor_name": name,
            "initials": initials[:2],
            "amount_minor": int(row["amount_minor"]),
            "line_label": labels.get(row.get("line_id") or ""),
            "created_at": row["created_at"],
        })
    return entries
