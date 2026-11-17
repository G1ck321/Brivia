-- Brivia — v1 gap fixes
-- Run in the Supabase SQL editor (or via migration) after supabase_migration.sql.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Gap 1: the platform fee was book-only. Every settled contribution now
-- writes a ledger row so fees can be reconciled and later swept out of the
-- receiving wallet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_fees (
    id          TEXT PRIMARY KEY,
    payment_id  TEXT NOT NULL,
    bill_id     TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    provider_id TEXT,
    gross_minor BIGINT NOT NULL CHECK (gross_minor > 0),
    fee_minor   BIGINT NOT NULL CHECK (fee_minor >= 0),
    net_minor   BIGINT NOT NULL CHECK (net_minor >= 0),
    currency    TEXT NOT NULL DEFAULT 'NGN',
    status      TEXT NOT NULL DEFAULT 'accrued'
                CHECK (status IN ('accrued', 'settled', 'reversed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_fees_payment ON platform_fees(payment_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_provider ON platform_fees(provider_id, status);

-- ---------------------------------------------------------------------------
-- Gap 2: grant continuation lived in audit_logs metadata and a JS Map. It now
-- has a real table so a restart (or a second instance) cannot lose a payment
-- that a contributor has already approved.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS op_grants (
    payment_id           TEXT PRIMARY KEY,
    continue_uri         TEXT NOT NULL,
    continue_token       TEXT NOT NULL,
    interact_redirect    TEXT,
    interact_ref         TEXT,
    sender_wallet_url    TEXT,
    incoming_payment_id  TEXT,
    quote_id             TEXT,
    finish_nonce         TEXT,
    expires_at           TIMESTAMPTZ NOT NULL,
    consumed_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_grants_expiry ON op_grants(expires_at);

-- ---------------------------------------------------------------------------
-- Gap 6: one global receiving wallet. Providers can now own their wallet
-- address; the backend falls back to OP_RECEIVING_WALLET_URL when unset.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address_url TEXT;
