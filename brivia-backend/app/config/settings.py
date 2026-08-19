"""
Brivia Backend Configuration
Uses pydantic-settings to load from .env and validate required values.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Application ---
    APP_NAME: str = "Brivia"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    CORS_ORIGINS: str = "http://localhost:3000"

    # --- Supabase ---
    SUPABASE_URL: str
    SUPABASE_KEY: str  # anon / public key
    SUPABASE_SERVICE_KEY: str  # service_role key (server-side only)

    # --- JWT ---
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # --- Payment ---
    PAYMENT_PROVIDER: str = "mock"  # "mock" | "openpayments"
    IDEMPOTENCY_KEY_LENGTH: int = 32

    # --- Open Payments ---
    OP_SERVER_URL: str = "http://localhost:3100"  # Node.js Open Payments server
    OP_PRIVATE_KEY_PATH: str = "private.key"
    OP_KEY_ID: str = ""
    OP_WALLET_ADDRESS_URL: str = ""  # Provider's wallet address
    OP_RECEIVING_WALLET_URL: str = ""  # Where payments land
    OP_GRANT_SERVER: str = "https://auth.interledger-test.dev"

    # --- Bill ---
    BILL_ID_PREFIX: str = "BRV-"
    BILL_ID_LENGTH: int = 8
    SHARE_TOKEN_LENGTH: int = 40

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton for app settings."""
    return Settings()
