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

    # --- Public endpoint protection ---
    PUBLIC_RATE_LIMIT_PER_MINUTE: int = 60  # 0 disables the limiter
    # Reads (care page, circle poll, quote preview, receipt) are cheap and are
    # what a live demo hammers. They get their own, much higher ceiling so
    # polling every few seconds plus typing an amount cannot 429.
    PUBLIC_READ_RATE_LIMIT_PER_MINUTE: int = 600

    # --- Open Payments ---
    # OP_SERVER_URL must be set in production (e.g. https://brivia-op-server.onrender.com)
    OP_SERVER_URL: str = ""  # Node.js Open Payments server
    OP_PRIVATE_KEY_PATH: str = "private.key"
    OP_KEY_ID: str = ""
    OP_WALLET_ADDRESS_URL: str = ""  # Provider's wallet address
    OP_RECEIVING_WALLET_URL: str = ""  # Where payments land
    OP_GRANT_SERVER: str = "https://auth.interledger-test.dev"
    OP_GRANT_TTL_MINUTES: int = 15  # how long a continuation stays usable

    # --- Reconciliation ---
    RECONCILER_ENABLED: bool = True
    RECONCILER_INTERVAL_SECONDS: int = 60
    # Extra slack on top of OP_GRANT_TTL_MINUTES before an untouched payment is
    # declared abandoned. A contributor can sit in their wallet for a while;
    # failing the row while they are still approving would strand the transfer.
    RECONCILER_PAYMENT_GRACE_MINUTES: int = 10

    # --- Telegram (optional; the product works without these) ---
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""

    # --- Bill ---
    BILL_ID_PREFIX: str = "BRV-"
    BILL_ID_LENGTH: int = 8
    SHARE_TOKEN_LENGTH: int = 40
    SHARE_TOKEN_TTL_DAYS: int = 30  # 0 means share links never expire

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton for app settings."""
    return Settings()
