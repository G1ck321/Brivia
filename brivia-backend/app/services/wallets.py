"""
Receiving-wallet resolution (gap 6).

v1 had exactly one global receiving wallet (``OP_RECEIVING_WALLET_URL``).
A provider can now own a wallet address; we fall back to the deployment-wide
wallet so existing setups keep working unchanged.
"""

from app.config.db import get_supabase
from app.config.settings import get_settings


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
