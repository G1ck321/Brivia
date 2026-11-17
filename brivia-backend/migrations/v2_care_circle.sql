-- Brivia v2 — "Care Circle"
-- Run after supabase_migration.sql and 2026_11_gap_fixes.sql. Safe to re-run.

-- Itemised bills: a bill is a list of claimable lines.
CREATE TABLE IF NOT EXISTS bill_lines (
    id           TEXT PRIMARY KEY,
    bill_id      TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    funded_minor BIGINT NOT NULL DEFAULT 0 CHECK (funded_minor >= 0),
    position     INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines(bill_id, position);

-- Which line a contribution was claimed against (null = whole-bill gift).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS line_id TEXT;

-- Provider-signed bill digest: the anti-tamper record.
CREATE TABLE IF NOT EXISTS bill_verifications (
    bill_id      TEXT PRIMARY KEY REFERENCES bills(id) ON DELETE CASCADE,
    payload_hash TEXT NOT NULL,
    signature    TEXT NOT NULL,
    algorithm    TEXT NOT NULL DEFAULT 'HMAC-SHA256',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Telegram wiring. Subscriptions are stored with or without a bot token.
CREATE TABLE IF NOT EXISTS telegram_subscriptions (
    id          TEXT PRIMARY KEY,
    bill_id     TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    chat_id     TEXT,
    handle      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_subs_bill ON telegram_subscriptions(bill_id);

-- Outbox: every notification is written here first, so the product works with
-- no bot token configured. When a token appears, queued rows can be flushed.
CREATE TABLE IF NOT EXISTS notification_outbox (
    id          TEXT PRIMARY KEY,
    channel     TEXT NOT NULL DEFAULT 'telegram',
    bill_id     TEXT REFERENCES bills(id) ON DELETE CASCADE,
    target      TEXT,
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'sent', 'failed')),
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_bill ON notification_outbox(bill_id, created_at DESC);
