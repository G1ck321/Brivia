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


def get_op_server_url() -> str:
    """Get the Open Payments server URL."""
    settings = get_settings()
    # Default to local Node.js server
    return getattr(settings, "OP_SERVER_URL", "http://localhost:3100")


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
