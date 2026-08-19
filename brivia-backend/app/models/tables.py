"""
SQLAlchemy-like model definitions for Brivia.
We use plain dicts and Supabase's PostgREST API — these are type hints and docstrings
to document the expected table shapes. Supabase handles the actual schema.
"""

# --- users table ---
# id: uuid (primary key)
# email: text (unique)
# name: text
# password_hash: text
# role: text (provider | patient)
# facility_name: text (nullable, for providers)
# created_at: timestamptz
# updated_at: timestamptz

# --- bills table ---
# id: uuid (primary key)
# public_bill_id: text (unique, e.g. BRV-XXXXXXXX)
# provider_id: uuid (FK → users.id)
# patient_id: uuid (FK → users.id, nullable for unregistered patients)
# patient_name: text (denormalized for display)
# description: text
# amount_minor: bigint (kobo-equivalent minor units)
# currency: text (default 'NGN')
# amount_paid_minor: bigint (default 0)
# remaining_balance_minor: bigint
# status: text (ISSUED | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED)
# due_date: date
# created_at: timestamptz
# updated_at: timestamptz

# --- payments table ---
# id: uuid (primary key)
# bill_id: uuid (FK → bills.id)
# contributor_id: uuid (FK → users.id, nullable for anonymous contributors)
# contributor_name: text
# amount_minor: bigint
# currency: text (default 'NGN')
# status: text (CREATED | INITIATED | COMPLETED | FAILED | REFUNDED)
# payment_reference: text (unique)
# external_payment_id: text (nullable)
# idempotency_key: text (unique)
# created_at: timestamptz
# updated_at: timestamptz

# --- bill_shares table ---
# id: uuid (primary key)
# bill_id: uuid (FK → bills.id)
# share_token: text (unique, URL-safe)
# expires_at: timestamptz (nullable)
# created_at: timestamptz

# --- audit_logs table ---
# id: uuid (primary key)
# actor_id: uuid (FK → users.id, nullable)
# action: text
# resource_type: text
# resource_id: uuid
# metadata: jsonb (nullable)
# created_at: timestamptz

TABLE_NAMES = {
    "users": "users",
    "bills": "bills",
    "payments": "payments",
    "bill_shares": "bill_shares",
    "audit_logs": "audit_logs",
}
