"""
FastAPI client for the Open Payments Node.js server.

This calls the local Node.js server which handles the actual
Open Payments / Interledger flow.

The Node.js server can run locally or be hosted separately.
Configure via OP_SERVER_URL env var.
"""

import httpx
import logging
from app.config.settings import get_settings

logger = logging.getLogger(__name__)


class WalletPaymentError(Exception):
    """
    A wallet-network failure with a message safe to show a contributor.

    ``status_code`` is what the API should answer with: 4xx when the address
    looks wrong, 5xx when the wallet network itself is unavailable.
    """

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def get_op_server_url() -> str:
    """Get the Open Payments server URL.
    
    Raises RuntimeError if not configured — prevents silent localhost fallback in production.
    """
    settings = get_settings()
    url = settings.OP_SERVER_URL.strip() if settings.OP_SERVER_URL else ""
    if not url:
        raise RuntimeError(
            "OP_SERVER_URL is not configured. "
            "Set the OP_SERVER_URL environment variable to the Node.js Open Payments server URL."
        )
    return url.rstrip("/")


async def _post(path: str, data: dict) -> dict:
    """Make a POST request to the Open Payments server."""
    url = f"{get_op_server_url()}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=data)
        resp.raise_for_status()
        return resp.json()


async def _get(path: str) -> dict:
    """Make a GET request to the Open Payments server."""
    url = f"{get_op_server_url()}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


# --- Public API ---

async def check_op_server_health() -> bool:
    """Check if the Open Payments server is running."""
    try:
        result = await _get("/health")
        return result.get("status") == "ok"
    except Exception:
        return False


async def setup_incoming_payment(
    receiver_wallet_url: str,
    amount_minor: int,
    reference: str,
) -> dict:
    """
    Create an incoming payment on the receiver's wallet.
    
    Returns:
        {
            "incoming_payment_id": "...",
            "wallet_address": "...",
            "access_token": "...",
            ...
        }
    """
    return await _post("/setup-incoming", {
        "receiver_wallet_url": receiver_wallet_url,
        "amount_minor": amount_minor,
        "reference": reference,
    })


async def get_wallet_asset(wallet_address_url: str) -> dict:
    """Resolve a wallet's asset code and scale.

    Needed before a payment: the bill is priced in its own currency, but the
    contributor's wallet only quotes and debits its own asset.

    Returns:
        {"wallet_address": "...", "asset_code": "EUR", "asset_scale": 2}
    """
    return await _post("/wallet-info", {"wallet_address_url": wallet_address_url})


def _extract_failure_reason(payload) -> str:
    """Pull a readable reason out of the Open Payments server's error body."""
    if not isinstance(payload, dict):
        return ""

    parts: list[str] = []
    for key in ("error", "message", "detail"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
        elif isinstance(value, dict):
            for inner in ("description", "message", "error"):
                text = value.get(inner)
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
    return " | ".join(parts)


def wallet_failure_message(reason: str) -> str:
    """Map a wallet/network failure onto advice the contributor can act on."""
    text = (reason or "").lower()

    if any(
        marker in text
        for marker in (
            "fetch failed",
            "enotfound",
            "econnrefused",
            "econnreset",
            "getaddrinfo",
            "network",
            "timed out",
            "timeout",
            "socket hang up",
        )
    ):
        return (
            "We couldn't reach a wallet at that address. Check the link is correct "
            "and that your wallet is online, then try again."
        )

    if any(marker in text for marker in ("404", "not found", "no such", "unknown wallet")):
        return (
            "No Open Payments wallet was found at that address. Use the wallet "
            "address shown in your wallet app, for example "
            "https://ilp.interledger-test.dev/your-wallet."
        )

    if "non-positive receive amount" in text or "amount too small" in text or "minimum" in text:
        return (
            "That contribution is too small for the wallet network to settle. "
            "Try a larger amount."
        )

    if "invalid_interaction" in text or "interaction" in text:
        return (
            "Your wallet didn't confirm the approval. Please start the payment "
            "again from your wallet."
        )

    return (
        "Your wallet couldn't start this payment. Check the wallet address is "
        "correct and that the wallet supports Open Payments, then try again."
    )


async def request_outgoing_grant(
    sender_wallet_url: str,
    incoming_payment_url: str,
    amount_minor: int,
    callback_url: str,
) -> dict:
    """
    Ask the Open Payments server for an outgoing-payment grant.

    Every failure mode (unreachable service, malformed address, wallet error)
    becomes a :class:`WalletPaymentError` with a contributor-safe message, so
    the API never echoes raw httpx/Node errors as a 500.
    """
    url = f"{get_op_server_url()}/initiate-outgoing"
    payload = {
        "sender_wallet_url": sender_wallet_url,
        "incoming_payment_url": incoming_payment_url,
        "amount_minor": amount_minor,
        "callback_url": callback_url,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
    except httpx.TimeoutException:
        logger.warning("Open Payments server timed out at %s", url)
        raise WalletPaymentError(
            "The wallet network took too long to respond. Please try again.", 504
        )
    except httpx.HTTPError as exc:
        logger.warning("Open Payments server unreachable at %s: %s", url, exc)
        raise WalletPaymentError(
            "We couldn't reach the payment service. Please try again in a moment.", 503
        )

    if resp.status_code >= 400:
        try:
            reason = _extract_failure_reason(resp.json())
        except ValueError:
            reason = ""
        logger.warning(
            "initiate-outgoing failed (%s): %s", resp.status_code, reason or resp.text[:300]
        )
        raise WalletPaymentError(
            wallet_failure_message(reason),
            400 if resp.status_code < 500 else 502,
        )

    try:
        result = resp.json()
    except ValueError:
        logger.warning("initiate-outgoing returned non-JSON: %s", resp.text[:300])
        raise WalletPaymentError(
            "The payment service returned an unreadable response. Please try again.", 502
        )

    if not result.get("interact_redirect") or not result.get("continue_uri"):
        logger.warning("initiate-outgoing returned no approval link: %s", result)
        raise WalletPaymentError(
            "Your wallet didn't return an approval link. Check the wallet address "
            "and try again.",
            502,
        )

    return result


async def initiate_outgoing_payment(
    sender_wallet_url: str,
    amount_minor: int,
) -> dict:
    """
    Request an outgoing payment grant (requires user approval).
    
    Returns:
        {
            "interact_redirect": "https://...",
            "continue_uri": "...",
            "continue_token": "..."
        }
    """
    return await _post("/initiate-outgoing", {
        "sender_wallet_url": sender_wallet_url,
        "amount_minor": amount_minor,
    })


async def finalize_and_execute_payment(
    payment_id: str,
    continue_uri: str,
    continue_token: str,
    sender_wallet_url: str,
    incoming_payment_id: str,
    amount_minor: int,
    description: str = "Brivia bill contribution",
) -> dict:
    """
    After user approves the grant, finalize and execute the payment.
    
    Returns:
        {
            "payment_id": "...",
            "receive_amount": {...},
            "debit_amount": {...},
            ...
        }
    """
    return await _post("/finalize-payment", {
        "payment_id": payment_id,
        "continue_uri": continue_uri,
        "continue_token": continue_token,
        "sender_wallet_url": sender_wallet_url,
        "incoming_payment_id": incoming_payment_id,
        "amount_minor": amount_minor,
        "description": description,
    })


async def poll_settlement(
    incoming_payment_url: str,
    max_attempts: int = 30,
    interval_ms: int = 2000,
) -> dict:
    """
    Poll the incoming payment for settlement.
    
    Returns:
        {
            "status": "completed" | "pending" | "timeout",
            "received_amount": {...},
            "completed": bool
        }
    """
    return await _post("/poll-settlement", {
        "incoming_payment_url": incoming_payment_url,
        "max_attempts": max_attempts,
        "interval_ms": interval_ms,
    })
