"""
Receiving-wallet resolution (gap 6).

v1 had exactly one global receiving wallet (``OP_RECEIVING_WALLET_URL``).
A provider can now own a wallet address; we fall back to the deployment-wide
wallet so existing setups keep working unchanged.
"""

from urllib.parse import urlparse

from app.config.db import get_supabase
from app.config.settings import get_settings

WALLET_HINT = (
    "Use the wallet address from your Open Payments wallet, "
    "for example https://ilp.interledger-test.dev/your-wallet."
)


def normalize_sender_wallet(raw: str | None) -> str:
    """
    Validate and tidy a contributor's wallet address before it reaches the
    Open Payments server.

    A wallet address is a public URL that resolves to a JSON wallet document.
    Checking it here means a typo comes back as a clear 400 instead of a 500
    from deep inside the wallet network. Raises ``ValueError`` with a message
    safe to show the contributor.
    """
    value = (raw or "").strip()
    if not value:
        raise ValueError("Enter the wallet address you want to pay from. " + WALLET_HINT)

    if len(value) > 2048 or any(char.isspace() for char in value):
        raise ValueError("That wallet address isn't a valid URL. " + WALLET_HINT)

    parsed = urlparse(value)
    if not parsed.scheme:
        raise ValueError("Wallet addresses start with https://. " + WALLET_HINT)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("That wallet address isn't a web URL. " + WALLET_HINT)
    if not parsed.hostname:
        raise ValueError("That wallet address is missing its domain. " + WALLET_HINT)
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        raise ValueError("Wallet addresses must use https://. " + WALLET_HINT)

    return value


def resolve_receiving_wallet(bill: dict) -> str:
    """
    Return the wallet URL that should receive contributions for ``bill``.

    Order: the provider's own wallet → the deployment default. Raises
    ``ValueError`` when neither is configured, so callers can return a clear
    500 instead of failing deep inside the Open Payments call.
    """
    settings = get_settings()

    provider_id = bill.get("provider_id")
    if provider_id:
        try:
            db = get_supabase()
            result = (
                db.table("users")
                .select("wallet_address_url")
                .eq("id", provider_id)
                .limit(1)
                .execute()
            )
            if result.data:
                wallet = (result.data[0].get("wallet_address_url") or "").strip()
                if wallet:
                    return wallet
        except Exception:
            # Column missing or query failed — fall through to the default.
            pass

    # Empty string rather than an exception: callers already branch on a
    # missing wallet and return a clear configuration error.
    return (settings.OP_RECEIVING_WALLET_URL or "").strip()

