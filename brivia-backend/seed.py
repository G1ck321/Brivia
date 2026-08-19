"""
Seed script: creates test users and a bill in Supabase.
Run: python seed.py
"""

import secrets
from datetime import datetime, timezone, timedelta
from app.config.db import get_supabase
from app.config.security import hash_password


def seed():
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # --- Create provider user ---
    provider_id = secrets.token_hex(16)
    provider = {
        "id": provider_id,
        "email": "provider@brivia.app",
        "name": "Dr. Temi Adeyemi",
        "password_hash": hash_password("password123"),
        "role": "provider",
        "facility_name": "Brivia Demo Hospital",
        "created_at": now,
        "updated_at": now,
    }

    existing = db.table("users").select("id").eq("email", "provider@brivia.app").execute()
    if not existing.data:
        db.table("users").insert(provider).execute()
        print(f"[OK] Created provider: provider@brivia.app / password123")
    else:
        provider_id = existing.data[0]["id"]
        print(f"[INFO] Provider already exists")

    # --- Create patient user ---
    patient_id = secrets.token_hex(16)
    patient = {
        "id": patient_id,
        "email": "patient@brivia.app",
        "name": "Chidinma Okeke",
        "password_hash": hash_password("password123"),
        "role": "patient",
        "facility_name": None,
        "created_at": now,
        "updated_at": now,
    }

    existing = db.table("users").select("id").eq("email", "patient@brivia.app").execute()
    if not existing.data:
        db.table("users").insert(patient).execute()
        print(f"[OK] Created patient: patient@brivia.app / password123")
    else:
        patient_id = existing.data[0]["id"]
        print(f"[INFO] Patient already exists")

    # --- Create bill ---
    bill_id = secrets.token_hex(16)
    public_bill_id = f"BRV-{secrets.token_hex(4).upper()}"
    share_token = secrets.token_urlsafe(30)
    amount = 50000000  # ₦500,000 in kobo

    existing_bills = db.table("bills").select("id").eq("provider_id", provider_id).execute()
    if not existing_bills.data:
        bill = {
            "id": bill_id,
            "public_bill_id": public_bill_id,
            "provider_id": provider_id,
            "patient_name": "Chidinma Okeke",
            "description": "Outpatient surgery — right knee arthroscopy",
            "amount_minor": amount,
            "currency": "NGN",
            "amount_paid_minor": 0,
            "remaining_balance_minor": amount,
            "status": "ISSUED",
            "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat(),
            "created_at": now,
            "updated_at": now,
        }
        db.table("bills").insert(bill).execute()

        # Create share link
        share = {
            "id": secrets.token_hex(16),
            "bill_id": bill_id,
            "share_token": share_token,
            "expires_at": None,
            "created_at": now,
        }
        db.table("bill_shares").insert(share).execute()

        print(f"\n[OK] Created bill: {public_bill_id}")
        print(f"   Amount: NGN 500,000")
        print(f"   Share token: {share_token}")
        print(f"   Payment URL: http://localhost:3000/pay/{share_token}")
    else:
        # Get existing share token
        existing_bill = db.table("bills").select("*").eq("provider_id", provider_id).limit(1).execute()
        if existing_bill.data:
            share_result = db.table("bill_shares").select("share_token").eq("bill_id", existing_bill.data[0]["id"]).limit(1).execute()
            if share_result.data:
                print(f"\n[INFO] Bill already exists: {existing_bill.data[0]['public_bill_id']}")
                print(f"   Payment URL: http://localhost:3000/pay/{share_result.data[0]['share_token']}")

    print("\n--- Test accounts ---")
    print("Provider: provider@brivia.app / password123")
    print("Patient:  patient@brivia.app / password123")


if __name__ == "__main__":
    seed()
