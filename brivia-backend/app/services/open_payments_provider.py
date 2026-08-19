"""
Open Payments / Interledger payment provider.

Uses httpx directly to call the Open Payments REST API.
This matches the structure from the working JavaScript example.

Flow:
  1. Get wallet address info
  2. Create incoming payment on receiver's wallet
  3. Create outgoing payment grant (interactive)
  4. User approves → continue grant
  5. Execute outgoing payment
  6. Poll incoming payment until settled
"""

import asyncio
import httpx
import logging
from pathlib import Path
from datetime import datetime, timezone

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Open Payments API base paths
WALLET_ADDRESS_PATH = "/wallet-addresses"
GRANT_PATH = "/grant"
INCOMING_PAYMENT_PATH = "/incoming-payments"
OUTGOING_PAYMENT_PATH = "/outgoing-payments"


class OpenPaymentsProvider:
    """
    Open Payments provider using httpx directly.
    Handles the full payment flow without SDK dependencies.
    """

    def __init__(self):
        self._settings = get_settings()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create httpx client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self):
        """Close the httpx client."""
        if self._client:
            await self._client.aclose()

    # --- Wallet Address ---

    async def get_wallet_address(self, wallet_url: str) -> dict:
        """GET /wallet-addresses/{url} to fetch wallet info."""
        client = await self._get_client()
        resp = await client.get(wallet_url)
        resp.raise_for_status()
        return resp.json()

    # --- Grants ---

    async def request_grant(self, auth_server: str, access: list, interact: dict | None = None) -> dict:
        """POST to auth server to request a grant."""
        client = await self._get_client()
        body = {"access_token": {"access": access}}
        if interact:
            body["interact"] = interact
        resp = await client.post(f"{auth_server}/grant", json=body)
        resp.raise_for_status()
        return resp.json()

    async def continue_grant(self, continue_uri: str, continue_token: str) -> dict:
        """POST to continue URI after user approves interactive grant."""
        client = await self._get_client()
        resp = await client.post(
            continue_uri,
            headers={"Authorization": f"Bearer {continue_token}"},
        )
        resp.raise_for_status()
        return resp.json()

    # --- Incoming Payments ---

    async def create_incoming_payment(
        self,
        resource_server: str,
        access_token: str,
        wallet_address: str,
        asset_code: str,
        asset_scale: int,
        amount: str,
        description: str = "Brivia bill payment",
    ) -> dict:
        """Create an incoming payment on the receiver's wallet."""
        client = await self._get_client()
        resp = await client.post(
            f"{resource_server}{INCOMING_PAYMENT_PATH}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "walletAddress": wallet_address,
                "metadata": {"description": description},
                "incomingAmount": {
                    "assetCode": asset_code,
                    "assetScale": asset_scale,
                    "value": amount,
                },
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_incoming_payment(self, url: str, access_token: str) -> dict:
        """GET an incoming payment to check status."""
        client = await self._get_client()
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()

    # --- Outgoing Payments ---

    async def create_outgoing_payment(
        self,
        resource_server: str,
        access_token: str,
        wallet_address: str,
        incoming_payment_id: str,
        debit_amount: dict,
        description: str = "Brivia bill contribution",
    ) -> dict:
        """Create an outgoing payment after grant is approved."""
        client = await self._get_client()
        resp = await client.post(
            f"{resource_server}{OUTGOING_PAYMENT_PATH}",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "walletAddress": wallet_address,
                "incomingPayment": incoming_payment_id,
                "debitAmount": debit_amount,
                "metadata": {"description": description},
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_outgoing_payment(self, url: str, access_token: str) -> dict:
        """GET an outgoing payment to check status."""
        client = await self._get_client()
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()

    # --- High-level payment flow ---

    async def setup_incoming_payment(
        self,
        receiver_wallet_url: str,
        amount_minor: int,
        reference: str,
    ) -> dict:
        """
        Set up an incoming payment on the receiver's wallet.
        Returns the incoming payment details.
        """
        wallet = await self.get_wallet_address(receiver_wallet_url)

        # Request incoming payment grant
        grant = await self.request_grant(
            auth_server=wallet["authServer"],
            access=[{
                "type": "incoming-payment",
                "actions": ["create", "read"],
            }],
        )

        if grant.get("error"):
            raise ValueError(f"Grant request failed: {grant}")

        access_token = grant["access_token"]["value"]
        incoming_payment = await self.create_incoming_payment(
            resource_server=wallet["resourceServer"],
            access_token=access_token,
            wallet_address=wallet["id"],
            asset_code=wallet["assetCode"],
            asset_scale=wallet["assetScale"],
            amount=str(amount_minor),
            description=f"Brivia bill - {reference}",
        )

        logger.info(f"Incoming payment created: {incoming_payment['id']}")
        return incoming_payment

    async def initiate_outgoing_payment(
        self,
        sender_wallet_url: str,
        amount_minor: int,
    ) -> dict:
        """
        Request an outgoing payment grant (requires interactive approval).
        Returns the redirect URL for user approval.
        """
        wallet = await self.get_wallet_address(sender_wallet_url)

        grant = await self.request_grant(
            auth_server=wallet["authServer"],
            access=[{
                "type": "outgoing-payment",
                "actions": ["create"],
                "limits": {
                    "debitAmount": {
                        "assetCode": wallet["assetCode"],
                        "assetScale": wallet["assetScale"],
                        "value": str(amount_minor),
                    }
                },
                "identifier": wallet["id"],
            }],
            interact={"start": ["redirect"]},
        )

        if grant.get("error"):
            raise ValueError(f"Outgoing grant request failed: {grant}")

        return {
            "interact_redirect": grant["interact"]["redirect"],
            "continue_uri": grant["continue"]["uri"],
            "continue_token": grant["continue"]["access_token"]["value"],
        }

    async def finalize_and_pay(
        self,
        continue_uri: str,
        continue_token: str,
        sender_wallet_url: str,
        incoming_payment_id: str,
        amount_minor: int,
        description: str = "Brivia bill contribution",
    ) -> dict:
        """
        After user approves the grant, finalize it and execute the payment.
        """
        # Finalize grant
        grant = await self.continue_grant(continue_uri, continue_token)

        if grant.get("error"):
            raise ValueError(f"Grant finalization failed: {grant}")

        access_token = grant["access_token"]["value"]
        wallet = await self.get_wallet_address(sender_wallet_url)

        # Execute outgoing payment
        payment = await self.create_outgoing_payment(
            resource_server=wallet["resourceServer"],
            access_token=access_token,
            wallet_address=wallet["id"],
            incoming_payment_id=incoming_payment_id,
            debit_amount={
                "assetCode": wallet["assetCode"],
                "assetScale": wallet["assetScale"],
                "value": str(amount_minor),
            },
            description=description,
        )

        return payment

    async def poll_settlement(
        self,
        incoming_payment_url: str,
        access_token: str,
        max_attempts: int = 30,
        interval_ms: int = 2000,
    ) -> dict:
        """
        Poll the incoming payment until funds arrive or timeout.
        """
        for attempt in range(max_attempts):
            try:
                payment = await self.get_incoming_payment(incoming_payment_url, access_token)
                received = int(payment.get("receivedAmount", {}).get("value", 0))

                if payment.get("completed") or received > 0:
                    return {
                        "status": "completed",
                        "received_amount": payment.get("receivedAmount"),
                        "completed": payment.get("completed", False),
                    }
            except Exception as e:
                logger.warning(f"Poll attempt {attempt + 1} failed: {e}")

            await asyncio.sleep(interval_ms / 1000)

        return {
            "status": "timeout",
            "received_amount": {"value": "0"},
            "completed": False,
        }


# Singleton
_provider: OpenPaymentsProvider | None = None


def get_open_payments_provider() -> OpenPaymentsProvider:
    global _provider
    if _provider is None:
        _provider = OpenPaymentsProvider()
    return _provider
