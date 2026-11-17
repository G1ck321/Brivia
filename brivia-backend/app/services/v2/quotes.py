"""
Cross-currency preview (FR-3).

Two levels of honesty:

* ``source="ilp"`` — a real Open Payments quote from the contributor's wallet.
* ``source="indicative"`` — a static table, clearly labelled in the UI.

The indicative path is what makes the product usable with no wallet, no keys and
no network: the demo still shows "you send £20, the bill receives ₦41,300".
"""

from datetime import datetime, timedelta, timezone

import httpx

from app.config.settings import get_settings
from app.services.ledger import calculate_platform_fee

CURRENCIES = ["NGN", "GBP", "USD", "EUR", "KES", "GHS", "ZAR"]

# Indicative NGN per 1 major unit. Only used when no live quote is available.
FALLBACK_NGN_PER_UNIT = {
    "NGN": 1.0,
    "GBP": 2100.0,
    "USD": 1650.0,
    "EUR": 1780.0,
    "KES": 12.8,
    "GHS": 105.0,
    "ZAR": 90.0,
}

QUOTE_TTL_SECONDS = 300


def _expiry() -> str:
    return (
        datetime.now(timezone.utc) + timedelta(seconds=QUOTE_TTL_SECONDS)
    ).isoformat()


def supported(currency: str) -> str:
    code = (currency or "").upper()
    if code not in CURRENCIES:
        raise ValueError(f"Unsupported currency '{currency}'. Try one of {', '.join(CURRENCIES)}.")
    return code


def _rate(currency: str, bill_currency: str) -> float:
    if currency == bill_currency:
        return 1.0
    try:
        return FALLBACK_NGN_PER_UNIT[currency] / FALLBACK_NGN_PER_UNIT[bill_currency]
    except KeyError as exc:
        raise ValueError(f"No rate available for {currency} → {bill_currency}.") from exc


def _build(currency: str, bill_currency: str, debit_minor: int, rate: float, source: str, note: str) -> dict:
    receive_minor = int(round(debit_minor * rate))
    fee_minor = calculate_platform_fee(receive_minor)
    return {
        "currency": currency,
        "bill_currency": bill_currency,
        "debit_minor": debit_minor,
        "receive_minor": receive_minor,
        "fee_minor": fee_minor,
        "net_minor": max(receive_minor - fee_minor, 0),
        "rate": round(rate, 6),
        "source": source,
        "expires_at": _expiry(),
        "note": note,
    }


def estimate(amount_minor: int, currency: str, bill_currency: str) -> dict:
    """Indicative conversion with no network call."""
    currency = supported(currency)
    bill_currency = supported(bill_currency)
    rate = _rate(currency, bill_currency)

    if currency == bill_currency:
        note = "Same currency as the bill — no conversion."
    else:
        note = (
            "Indicative rate. Your wallet shows the final amount it will debit "
            "when you approve."
        )

    return _build(currency, bill_currency, amount_minor, rate, "indicative", note)


async def preview(
    amount_minor: int,
    currency: str,
    bill_currency: str,
    sender_wallet_url: str | None = None,
    incoming_payment_url: str | None = None,
) -> dict:
    """
    Best available quote.

    A live ILP quote needs both the contributor's wallet and an incoming payment
    to price against; without either we fall back to the indicative table rather
    than inventing a number.
    """
    currency = supported(currency)
    bill_currency = supported(bill_currency)

    if currency != bill_currency and sender_wallet_url and incoming_payment_url:
        settings = get_settings()
        if settings.OP_SERVER_URL:
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    response = await client.post(
                        f"{settings.OP_SERVER_URL.rstrip('/')}/quote-preview",
                        json={
                            "sender_wallet_url": sender_wallet_url,
                            "incoming_payment_url": incoming_payment_url,
                            "amount_minor": amount_minor,
                        },
                    )
                    response.raise_for_status()
                    data = response.json()

                debit = int(data.get("debit_minor") or amount_minor)
                receive = int(data.get("receive_minor") or 0)
                if receive > 0 and debit > 0:
                    quote = _build(
                        currency,
                        bill_currency,
                        debit,
                        receive / debit,
                        "ilp",
                        "Live quote from the contributor's wallet. It expires shortly — "
                        "re-check before approving.",
                    )
                    quote["debit_minor"] = debit
                    quote["receive_minor"] = receive
                    quote["fee_minor"] = calculate_platform_fee(receive)
                    quote["net_minor"] = max(receive - quote["fee_minor"], 0)
                    return quote
            except Exception:
                pass

    return estimate(amount_minor, currency, bill_currency)
