"""
Supabase client singleton.
Uses supabase-py to interact with the Supabase Postgres database.
"""

import time

import httpx
from supabase import create_client, Client
from app.config.settings import get_settings

_client: Client | None = None


def _install_read_retry(client: Client, attempts: int = 3) -> None:
    """Retry idempotent PostgREST reads when the socket blips.

    On Windows, ``httpx`` occasionally raises ``ReadError [WinError 10035]``
    for a request that never reached Postgres. A single unlucky read used to
    surface as a 500 (e.g. the patient opening their bill right after a demo
    claim). Retrying GET/HEAD is safe because nothing is written; writes are
    left untouched so a retry can never duplicate an insert.
    """
    session = client.postgrest.session
    original = session.request

    def request(method, url, **kwargs):
        if method.upper() not in ("GET", "HEAD"):
            return original(method, url, **kwargs)
        for attempt in range(attempts):
            try:
                return original(method, url, **kwargs)
            except httpx.TransportError:
                if attempt == attempts - 1:
                    raise
                time.sleep(0.2 * (attempt + 1))

    session.request = request


def get_supabase() -> Client:
    """Return a cached Supabase client."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        _install_read_retry(_client)
    return _client


def get_supabase_anon() -> Client:
    """Return a Supabase client using the anon (public) key."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
