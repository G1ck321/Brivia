"""
Supabase client singleton.
Uses supabase-py to interact with the Supabase Postgres database.
"""

from supabase import create_client, Client
from app.config.settings import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    """Return a cached Supabase client."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client


def get_supabase_anon() -> Client:
    """Return a Supabase client using the anon (public) key."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
