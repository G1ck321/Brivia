"""
Care Circle (v2) API.

Public routes carry the itemised view, quote preview, claims, the circle feed,
receipts and Telegram subscription. Provider routes stay authenticated and cover
itemisation, reconciliation and the bill seal.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse

from app.config.db import get_supabase
from app.config.settings import get_settings
from app.routers.auth import get_current_user
from app.schema.schemas import PaymentCreate
from app.schema.v2_schemas import (
    BillLineOut,
    BillLinesReplace,
    CareBill,
    CareResponse,
    CircleEntry,
    ClaimRequest,
    ClaimResponse,
    NotificationRow,
    QuoteRequest,
    QuoteResponse,
    ReceiptResponse,
    ReconResponse,
    TelegramSubscribeRequest,
    VerifyResponse,
)
from app.services.bill_service import get_public_bill_by_token
from app.services.bill_service import can_access_bill
from app.services.payment_service import initiate_contribution
from app.services.ratelimit import public_rate_limit
from app.services.v2 import lines as lines_service
from app.services.v2 import notify as notify_service
from app.services.v2 import quotes as quote_service
from app.services.v2 import receipts as receipt_service
from app.services.v2 import verify as verify_service

router = APIRouter(prefix="/v2", tags=["Care Circle (v2)"])

# Reads are polled every few seconds and re-quoted on every pause while
# typing, so they use the generous read bucket. Claims stay tightly limited.
read_limit = public_rate_limit("v2-read")
claim_limit = public_rate_limit("v2-claim")


# --- helpers ---------------------------------------------------------------

def _bill_row(db, bill_id: str) -> dict:
    result = db.table("bills").select("*").eq("id", bill_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found.")
    return result.data[0]


def _owned_bill(db, bill_id: str, user: dict) -> dict:
    bill = _bill_row(db, bill_id)
    if bill["provider_id"] != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage bills you created.",
        )
    return bill


async def _public_context(db, share_token: str) -> tuple[dict, object]:
    result = await get_public_bill_by_token(share_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This bill link is invalid or has expired.",
        )
    public, bill_id = result
    return _bill_row(db, bill_id), public


def _money(amount_minor: int, currency: str) -> str:
    return f"{currency} {amount_minor / 100:,.2f}"


# --- provider: itemisation -------------------------------------------------

@router.post("/bills/{bill_id}/lines", response_model=list[BillLineOut])
async def set_lines(
    bill_id: str,
    data: BillLinesReplace,
    user: dict = Depends(get_current_user),
):
    """Replace a bill's line items. Lines must sum exactly to the bill total."""
    if user["role"] != "provider":
        raise HTTPException(status_code=403, detail="Only providers can itemise bills.")
    db = get_supabase()
    bill = _owned_bill(db, bill_id, user)
    try:
        return lines_service.replace_lines(
            db, bill, [line.model_dump() for line in data.lines]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/bills/{bill_id}/lines", response_model=list[BillLineOut])
async def list_lines(bill_id: str, user: dict = Depends(get_current_user)):
    """Lines for a bill the caller is allowed to see."""
    db = get_supabase()
    bill = _bill_row(db, bill_id)
    if not can_access_bill(bill, user):
        raise HTTPException(status_code=403, detail="You cannot view this bill.")
    return lines_service.get_lines(db, bill["id"])


# --- provider: verification ------------------------------------------------

@router.post("/bills/{bill_id}/verify", response_model=VerifyResponse)
async def sign_bill(bill_id: str, user: dict = Depends(get_current_user)):
    """Seal a bill so contributors can detect later edits."""
    if user["role"] != "provider":
        raise HTTPException(status_code=403, detail="Only providers can seal a bill.")
    db = get_supabase()
    bill = _owned_bill(db, bill_id, user)
    try:
        return verify_service.sign_bill(db, bill)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/bills/{bill_id}/verify", response_model=VerifyResponse)
async def verify_bill(bill_id: str, user: dict = Depends(get_current_user)):
    """Check a bill against its seal."""
    db = get_supabase()
    bill = _bill_row(db, bill_id)
    return verify_service.verify_bill(db, bill)


# --- provider: reconciliation ---------------------------------------------

@router.get("/bills/{bill_id}/reconciliation", response_model=ReconResponse)
async def reconciliation(
    bill_id: str,
    format: str = "json",
    user: dict = Depends(get_current_user),
):
    """Every contribution with its fee, line and settlement state."""
    db = get_supabase()
    bill = _owned_bill(db, bill_id, user)
    payload = receipt_service.reconciliation(db, bill)

    if format == "csv":
        return PlainTextResponse(
            content=receipt_service.reconciliation_csv(payload),
            media_type="text/csv",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{bill["public_bill_id"]}-reconciliation.csv"'
                )
            },
        )
    return payload


# --- public: the care page -------------------------------------------------

@router.get(
    "/public/bills/{share_token}/care",
    response_model=CareResponse,
    dependencies=[Depends(read_limit)],
)
async def care_page(share_token: str):
    """Everything the contributor page needs in one request."""
    db = get_supabase()
    bill, public = await _public_context(db, share_token)

    verification = verify_service.verify_bill(db, bill)

    return CareResponse(
        bill=CareBill(
            public_bill_id=public.public_bill_id,
            description=public.description,
            provider_name=public.provider_name,
            facility_name=public.facility_name,
            currency=public.currency,
            amount_minor=public.amount_minor,
            amount_paid_minor=public.amount_paid_minor,
            remaining_balance_minor=public.remaining_balance_minor,
            status=public.status.value if hasattr(public.status, "value") else str(public.status),
            due_date=public.due_date,
            lines=lines_service.get_lines(db, bill["id"]),
            verified=verification["verified"],
            verify_note=verification["note"],
        ),
        circle=lines_service.circle(db, bill["id"]),
        telegram=notify_service.status(),
        currencies=quote_service.CURRENCIES,
    )


@router.get(
    "/public/bills/{share_token}/circle",
    response_model=list[CircleEntry],
    dependencies=[Depends(read_limit)],
)
async def circle_feed(share_token: str):
    """Poll target for the live contributor strip."""
    db = get_supabase()
    bill, _ = await _public_context(db, share_token)
    return lines_service.circle(db, bill["id"])


@router.get(
    "/public/bills/{share_token}/verify",
    response_model=VerifyResponse,
    dependencies=[Depends(read_limit)],
)
async def public_verify(share_token: str):
    """Anyone with the link can check the provider's seal."""
    db = get_supabase()
    bill, _ = await _public_context(db, share_token)
    return verify_service.verify_bill(db, bill)


# --- public: quote preview -------------------------------------------------

@router.post(
    "/public/bills/{share_token}/quote",
    response_model=QuoteResponse,
    dependencies=[Depends(read_limit)],
)
async def quote_preview(share_token: str, data: QuoteRequest):
    """Preview what the bill receives for an amount in the contributor's currency."""
    db = get_supabase()
    bill, _ = await _public_context(db, share_token)

    try:
        quote = await quote_service.preview(
            amount_minor=data.amount_minor,
            currency=data.currency,
            bill_currency=bill.get("currency") or "NGN",
            sender_wallet_url=data.sender_wallet_url,
            incoming_payment_url=bill.get("external_payment_id"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return QuoteResponse(**quote)


@router.get("/currencies")
async def currencies():
    """Currencies the UI offers for the quote preview."""
    return {"currencies": quote_service.CURRENCIES}


# --- public: claim ---------------------------------------------------------

@router.post(
    "/public/bills/{share_token}/claim",
    response_model=ClaimResponse,
    dependencies=[Depends(claim_limit)],
)
async def claim(share_token: str, data: ClaimRequest):
    """
    Claim a line (or the whole bill) and settle it through the configured
    provider. In demo mode this is the mock provider; live wallet payments go
    through ``/public/bills/{token}/pay/open-payments`` with ``line_id`` set.
    """
    db = get_supabase()
    bill, public = await _public_context(db, share_token)

    if bill["status"] in ("PAID", "CANCELLED"):
        raise HTTPException(
            status_code=400,
            detail=f"This bill is {bill['status'].lower()} and cannot take contributions.",
        )

    if data.amount_minor > int(bill["remaining_balance_minor"]):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Amount exceeds the remaining balance of "
                f"{_money(int(bill['remaining_balance_minor']), bill.get('currency') or 'NGN')}."
            ),
        )

    if data.line_id:
        line = lines_service.get_line(db, bill["id"], data.line_id)
        if not line:
            raise HTTPException(status_code=404, detail="That line item no longer exists.")
        if data.amount_minor > line["remaining_minor"]:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Only {_money(line['remaining_minor'], bill.get('currency') or 'NGN')} "
                    f"is left on {line['label']}."
                ),
            )

    payment = await initiate_contribution(
        bill_id=bill["id"],
        data=PaymentCreate(
            amount_minor=data.amount_minor,
            contributor_name=data.contributor_name,
            idempotency_key=data.idempotency_key,
        ),
        contributor_id=None,
        line_id=data.line_id,
    )

    remaining = max(
        int(bill["remaining_balance_minor"]) - int(payment.amount_minor), 0
    )
    await notify_service.notify_bill(
        db,
        bill,
        (
            f"Care Circle: {payment.contributor_name} contributed "
            f"{_money(payment.amount_minor, payment.currency)} to "
            f"{public.public_bill_id}. {_money(remaining, payment.currency)} still needed."
        ),
    )

    return ClaimResponse(
        payment=payment,
        line_id=data.line_id,
        receipt_path=f"/receipt/{payment.payment_reference}",
        message="Contribution recorded.",
    )


# --- public: receipts ------------------------------------------------------

@router.get(
    "/public/receipts/{reference}",
    response_model=ReceiptResponse,
    dependencies=[Depends(read_limit)],
)
async def receipt(reference: str):
    """Shareable receipt, no login required."""
    db = get_supabase()
    payload = receipt_service.build_receipt(db, reference)
    if not payload:
        raise HTTPException(status_code=404, detail="Receipt not found.")
    return payload


# --- public: telegram subscription ----------------------------------------

@router.post(
    "/public/bills/{share_token}/telegram",
    dependencies=[Depends(claim_limit)],
)
async def subscribe_telegram(share_token: str, data: TelegramSubscribeRequest):
    """
    Follow a bill's updates. Works without a bot token: the subscription and
    the welcome message are queued and delivered once Telegram is configured.
    """
    db = get_supabase()
    bill, public = await _public_context(db, share_token)

    notify_service.subscribe(db, bill["id"], data.chat_id, data.handle)
    delivery = await notify_service.deliver(
        db,
        bill["id"],
        (
            f"You're following {public.public_bill_id} "
            f"({public.facility_name}). We'll message you when it is funded or when "
            "a new contribution lands."
        ),
        data.chat_id,
    )

    return {
        "subscribed": True,
        "telegram": notify_service.status(),
        "delivery": delivery,
    }


# --- telegram webhook (optional) -----------------------------------------

@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """
    Telegram calls this. Configure with setWebhook and
    ``secret_token=TELEGRAM_WEBHOOK_SECRET``; the header is checked when set.

    ``/start BRV-XXXXXXXX`` subscribes the chat to that bill.
    """
    settings = get_settings()
    expected = (settings.TELEGRAM_WEBHOOK_SECRET or "").strip()
    if expected:
        provided = request.headers.get("x-telegram-bot-api-secret-token", "")
        if provided != expected:
            raise HTTPException(status_code=403, detail="Invalid webhook secret.")

    try:
        payload = await request.json()
    except Exception:
        payload = {}
    message = payload.get("message") or {}
    chat_id = str((message.get("chat") or {}).get("id") or "")
    text = str(message.get("text") or "").strip()

    if not chat_id or not text:
        return {"ok": True, "ignored": True}

    if not text.startswith("/start"):
        await notify_service.deliver(
            get_supabase(), None, "Send /start BRV-XXXXXXXX to follow a bill.", chat_id
        )
        return {"ok": True}

    parts = text.split()
    if len(parts) < 2:
        await notify_service.deliver(
            get_supabase(),
            None,
            "Send /start followed by the bill ID, e.g. /start BRV-1A2B3C4D.",
            chat_id,
        )
        return {"ok": True}

    db = get_supabase()
    public_id = parts[1].upper()
    bills = (
        db.table("bills")
        .select("*")
        .eq("public_bill_id", public_id)
        .limit(1)
        .execute()
    )
    if not bills.data:
        await notify_service.deliver(
            db, None, f"I couldn't find a bill called {public_id}.", chat_id
        )
        return {"ok": True, "found": False}

    bill = bills.data[0]
    notify_service.subscribe(db, bill["id"], chat_id, None)
    await notify_service.deliver(
        db,
        bill["id"],
        f"Subscribed to {public_id}. You'll get updates as contributions arrive.",
        chat_id,
    )
    return {"ok": True, "found": True}


# --- provider: outbox ------------------------------------------------------

@router.get("/notifications", response_model=list[NotificationRow])
async def list_notifications(user: dict = Depends(get_current_user)):
    """The provider's notification outbox."""
    db = get_supabase()
    return notify_service.outbox_for_provider(db, user["id"])


@router.post("/notifications/flush")
async def flush_notifications(user: dict = Depends(get_current_user)):
    """Deliver queued messages once a Telegram token exists."""
    db = get_supabase()
    return await notify_service.flush(db, user["id"])
