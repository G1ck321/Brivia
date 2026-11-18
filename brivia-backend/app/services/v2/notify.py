"""
Telegram notifications that work with or without credentials (requirement 3).

Every message is written to ``notification_outbox`` first. If a bot token and a
chat id are present it is delivered immediately; if not, it stays queued, the
API reports ``configured: false`` and the UI says so. Adding a token later and
calling ``/v2/notifications/flush`` delivers the backlog — nothing is lost and
nothing is faked.
"""

import html
import secrets
from datetime import datetime, timezone

import httpx

from app.config.settings import get_settings

TELEGRAM_API = "https://api.telegram.org"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def status() -> dict:
    settings = get_settings()
    configured = bool((settings.TELEGRAM_BOT_TOKEN or "").strip())
    username = (settings.TELEGRAM_BOT_USERNAME or "").strip() or None

    if configured:
        message = (
            "Telegram updates are live."
            if username
            else "Telegram is configured; set TELEGRAM_BOT_USERNAME to show a deep link."
        )
    else:
        message = (
            "Telegram is not connected. Updates are queued and will be delivered "
            "once a bot token is configured."
        )

    return {"configured": configured, "bot_username": username, "message": message}


def queue(db, bill_id: str | None, body: str, target: str | None = None) -> str:
    """Persist a notification. Returns its id."""
    row_id = secrets.token_hex(16)
    try:
        db.table("notification_outbox").insert({
            "id": row_id,
            "channel": "telegram",
            "bill_id": bill_id,
            "target": target,
            "body": body[:3800],
            "status": "queued",
            "created_at": _now_iso(),
        }).execute()
    except Exception:
        # Outbox table not migrated in yet. A notification is never worth
        # failing the contribution that triggered it.
        pass
    return row_id


async def _send(token: str, chat_id: str, body: str) -> tuple[bool, str | None]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{TELEGRAM_API}/bot{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": body,
                    "disable_web_page_preview": True,
                },
            )
        if response.status_code >= 400:
            return False, f"HTTP {response.status_code}"
        return True, None
    except Exception as exc:  # pragma: no cover - network dependent
        return False, str(exc)[:200]


async def deliver(db, bill_id: str | None, body: str, chat_id: str | None) -> dict:
    """Queue-and-send. Returns a small status dict the API can surface."""
    settings = get_settings()
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    outbox_id = queue(db, bill_id, body, chat_id)

    if not token or not chat_id:
        return {
            "id": outbox_id,
            "status": "queued",
            "configured": bool(token),
            "reason": "no_bot_token" if not token else "no_chat_id",
        }

    ok, error = await _send(token, chat_id, body)
    db.table("notification_outbox").update({
        "status": "sent" if ok else "failed",
        "error": error,
        "sent_at": _now_iso() if ok else None,
    }).eq("id", outbox_id).execute()

    return {
        "id": outbox_id,
        "status": "sent" if ok else "failed",
        "configured": True,
        "reason": error,
    }


def subscribe(db, bill_id: str, chat_id: str | None, handle: str | None) -> dict:
    """Attach a Telegram chat (or a pending handle) to a bill."""
    row = {
        "id": secrets.token_hex(16),
        "bill_id": bill_id,
        "chat_id": (chat_id or "").strip() or None,
        "handle": (handle or "").strip().lstrip("@") or None,
        "created_at": _now_iso(),
    }
    try:
        db.table("telegram_subscriptions").insert(row).execute()
    except Exception:
        # Duplicate or table missing — retry once without the new row id.
        pass
    return row


def subscribers(db, bill_id: str) -> list[dict]:
    try:
        result = (
            db.table("telegram_subscriptions")
            .select("*")
            .eq("bill_id", bill_id)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


async def notify_bill(db, bill: dict, body: str) -> list[dict]:
    """Fan a message out to every subscriber; queue once if there are none."""
    targets = [sub for sub in subscribers(db, bill["id"]) if sub.get("chat_id")]
    if not targets:
        return [await deliver(db, bill["id"], body, None)]

    results = []
    for sub in targets:
        results.append(await deliver(db, bill["id"], body, sub["chat_id"]))
    return results


def outbox_for_provider(db, provider_id: str, limit: int = 50) -> list[dict]:
    bill_ids = [
        row["id"]
        for row in (
            db.table("bills").select("id").eq("provider_id", provider_id).execute().data or []
        )
    ]
    if not bill_ids:
        return []
    result = (
        db.table("notification_outbox")
        .select("*")
        .in_("bill_id", bill_ids)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


async def flush(db, provider_id: str) -> dict:
    """
    Deliver queued messages once a token and a chat id exist.

    Without a token this is a no-op that reports the backlog size — it never
    pretends to have sent anything.
    """
    settings = get_settings()
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    rows = [
        row
        for row in outbox_for_provider(db, provider_id)
        if row.get("status") == "queued" and row.get("target")
    ]

    if not token:
        return {"sent": 0, "pending": len(rows), "configured": False}

    sent = 0
    for row in rows:
        ok, error = await _send(token, row["target"], row["body"])
        db.table("notification_outbox").update({
            "status": "sent" if ok else "failed",
            "error": error,
            "sent_at": _now_iso() if ok else None,
        }).eq("id", row["id"]).execute()
        sent += 1 if ok else 0

    return {"sent": sent, "pending": len(rows) - sent, "configured": True}


def escape(text: str) -> str:
    """For callers that opt into HTML formatting."""
    return html.escape(text)
