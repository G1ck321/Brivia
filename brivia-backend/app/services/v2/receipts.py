"""Receipts and provider reconciliation (FR-6, FR-7)."""

from app.services.ledger import calculate_platform_fee
from app.services.v2.lines import get_lines


def _fee_row(db, bill_id: str) -> dict[str, dict]:
    try:
        result = (
            db.table("platform_fees")
            .select("*")
            .eq("bill_id", bill_id)
            .execute()
        )
        return {row["payment_id"]: row for row in (result.data or [])}
    except Exception:
        return {}


def build_receipt(db, reference: str) -> dict | None:
    """Everything a shareable receipt needs, by payment reference."""
    payment_result = (
        db.table("payments")
        .select("*")
        .eq("payment_reference", reference)
        .limit(1)
        .execute()
    )
    if not payment_result.data:
        return None

    payment = payment_result.data[0]

    bill_result = db.table("bills").select("*").eq("id", payment["bill_id"]).limit(1).execute()
    if not bill_result.data:
        return None
    bill = bill_result.data[0]

    provider_result = (
        db.table("users")
        .select("name, facility_name")
        .eq("id", bill["provider_id"])
        .limit(1)
        .execute()
    )
    provider = provider_result.data[0] if provider_result.data else {}
    facility = provider.get("facility_name") or provider.get("name") or "Healthcare provider"

    gross = int(payment["amount_minor"])
    fee_row = _fee_row(db, bill["id"]).get(payment["id"])
    fee = int(fee_row["fee_minor"]) if fee_row else calculate_platform_fee(gross)

    line_label = None
    if payment.get("line_id"):
        for line in get_lines(db, bill["id"]):
            if line["id"] == payment["line_id"]:
                line_label = line["label"]
                break

    return {
        "payment_reference": payment["payment_reference"],
        "contributor_name": payment.get("contributor_name") or "Anonymous",
        "gross_minor": gross,
        "fee_minor": fee,
        "net_minor": gross - fee,
        "currency": payment.get("currency") or bill.get("currency") or "NGN",
        "bill_public_id": bill["public_bill_id"],
        "description": bill["description"],
        "provider_name": provider.get("name") or "Provider",
        "facility_name": facility,
        "line_label": line_label,
        "status": payment["status"],
        "created_at": payment["created_at"],
    }


def reconciliation(db, bill: dict) -> dict:
    """Every contribution to a bill with its fee, line and settlement state."""
    payments = (
        db.table("payments")
        .select("*")
        .eq("bill_id", bill["id"])
        .order("created_at", desc=True)
        .execute()
    ).data or []

    fees = _fee_row(db, bill["id"])
    labels = {line["id"]: line["label"] for line in get_lines(db, bill["id"])}

    rows = []
    gross_total = fee_total = net_total = 0
    settled = pending = 0

    for payment in payments:
        gross = int(payment["amount_minor"])
        fee_row = fees.get(payment["id"])
        fee = int(fee_row["fee_minor"]) if fee_row else calculate_platform_fee(gross)
        net = gross - fee

        if payment["status"] == "COMPLETED":
            gross_total += gross
            fee_total += fee
            net_total += net
            settled += 1
        elif payment["status"] in ("CREATED", "INITIATED"):
            pending += 1

        rows.append({
            "payment_reference": payment["payment_reference"],
            "contributor_name": payment.get("contributor_name") or "Anonymous",
            "line_label": labels.get(payment.get("line_id") or ""),
            "gross_minor": gross,
            "fee_minor": fee,
            "net_minor": net,
            "status": payment["status"],
            "external_payment_id": payment.get("external_payment_id"),
            "created_at": payment["created_at"],
        })

    return {
        "bill_public_id": bill["public_bill_id"],
        "currency": bill.get("currency") or "NGN",
        "rows": rows,
        "totals": {
            "gross_minor": gross_total,
            "fee_minor": fee_total,
            "net_minor": net_total,
            "settled_count": settled,
            "pending_count": pending,
        },
    }


def reconciliation_csv(payload: dict) -> str:
    """CSV for a provider's own books."""
    header = [
        "payment_reference", "contributor_name", "line", "gross_minor",
        "fee_minor", "net_minor", "status", "external_payment_id", "created_at",
    ]
    lines = [",".join(header)]

    def cell(value) -> str:
        text = "" if value is None else str(value)
        if any(ch in text for ch in ',"\n'):
            text = '"' + text.replace('"', '""') + '"'
        return text

    for row in payload["rows"]:
        lines.append(",".join([
            cell(row["payment_reference"]),
            cell(row["contributor_name"]),
            cell(row["line_label"]),
            cell(row["gross_minor"]),
            cell(row["fee_minor"]),
            cell(row["net_minor"]),
            cell(row["status"]),
            cell(row["external_payment_id"]),
            cell(row["created_at"]),
        ]))

    totals = payload["totals"]
    lines.append(",".join([
        cell("TOTAL"), cell(""), cell(""),
        cell(totals["gross_minor"]), cell(totals["fee_minor"]), cell(totals["net_minor"]),
        cell(f"{totals['settled_count']} settled"), cell(""), cell(""),
    ]))
    return "\n".join(lines)
