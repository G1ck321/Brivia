-- Brivia MVP Database Schema for Supabase (Postgres)
-- Run this in the Supabase SQL Editor or via migration.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('provider', 'patient')),
    facility_name TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
    id                       TEXT PRIMARY KEY,
    public_bill_id           TEXT UNIQUE NOT NULL,
    provider_id              TEXT NOT NULL REFERENCES users(id),
    patient_name             TEXT NOT NULL,
    description              TEXT NOT NULL,
    amount_minor             BIGINT NOT NULL CHECK (amount_minor > 0),
    currency                 TEXT NOT NULL DEFAULT 'NGN',
    amount_paid_minor        BIGINT NOT NULL DEFAULT 0,
    remaining_balance_minor  BIGINT NOT NULL,
    external_payment_id      TEXT,
    status                   TEXT NOT NULL DEFAULT 'ISSUED'
                             CHECK (status IN ('ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED')),
    due_date                 DATE NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id                   TEXT PRIMARY KEY,
    bill_id              TEXT NOT NULL REFERENCES bills(id),
    contributor_id       TEXT REFERENCES users(id),
    contributor_name     TEXT NOT NULL DEFAULT 'Anonymous',
    amount_minor         BIGINT NOT NULL CHECK (amount_minor > 0),
    currency             TEXT NOT NULL DEFAULT 'NGN',
    status               TEXT NOT NULL DEFAULT 'CREATED'
                         CHECK (status IN ('CREATED','INITIATED','COMPLETED','FAILED','REFUNDED')),
    payment_reference    TEXT UNIQUE NOT NULL,
    external_payment_id  TEXT,
    idempotency_key      TEXT UNIQUE NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BILL SHARES
-- ============================================================
CREATE TABLE IF NOT EXISTS bill_shares (
    id           TEXT PRIMARY KEY,
    bill_id      TEXT NOT NULL REFERENCES bills(id),
    share_token  TEXT UNIQUE NOT NULL,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id            TEXT PRIMARY KEY,
    actor_id      TEXT REFERENCES users(id),
    action        TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id   TEXT NOT NULL,
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bills_provider   ON bills(provider_id);
CREATE INDEX IF NOT EXISTS idx_bills_status     ON bills(status);
CREATE INDEX IF NOT EXISTS idx_payments_bill    ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_idem    ON payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_bill_shares_tok  ON bill_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_audit_resource   ON audit_logs(resource_type, resource_id);

-- ============================================================
-- ROW LEVEL SECURITY (enable in Supabase, configure policies as needed)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service-role bypass (Supabase backend uses service_key, so these are permissive for server access)
-- In production, tighten these policies for client-side access.
CREATE POLICY "Service role full access" ON users FOR ALL USING (true);
CREATE POLICY "Service role full access" ON bills FOR ALL USING (true);
CREATE POLICY "Service role full access" ON payments FOR ALL USING (true);
CREATE POLICY "Service role full access" ON bill_shares FOR ALL USING (true);
CREATE POLICY "Service role full access" ON audit_logs FOR ALL USING (true);
