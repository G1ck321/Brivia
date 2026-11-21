"""E2E smoke test: patient bill linking (live Supabase, real FastAPI app).

Covers: register provider + patient, resolve patient_email -> patient_id,
patient-side bill list, legacy name-only fallback, comma in patient name.
Creates records then deletes everything it created.
"""

import sys
import uuid
from pathlib import Path

import urllib.error
import urllib.parse
import urllib.request
import os

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent / "brivia-backend"
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

suffix = uuid.uuid4().hex[:8]
PROV_EMAIL = f"smoke-prov-{suffix}@example.com"
PAT_EMAIL = f"smoke-pat-{suffix}@example.com"
PAT_NAME = "Okafor, Chidi"  # comma: would have 400'd under the old or= filter
PASSWORD = "smoke-test-pw-123"
created = {"emails": [PROV_EMAIL, PAT_EMAIL], "bills": [], "actor_ids": []}
failures = []


def check(label, cond, detail=""):
    mark = "PASS" if cond else "FAIL"
    print(f"[{mark}] {label}{(' -> ' + str(detail)) if detail else ''}")
    if not cond:
        failures.append(label)


def cleanup():
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_KEY"]
    for table, col, values in (
        ("bill_shares", "bill_id", created["bills"]),
        ("audit_logs", "resource_id", created["bills"]),
        ("audit_logs", "actor_id", created["actor_ids"]),
        ("payments", "bill_id", created["bills"]),
        ("bills", "id", created["bills"]),
        ("users", "email", created["emails"]),
    ):
        for v in values:
            req = urllib.request.Request(
                f"{url}/rest/v1/{table}?{col}=eq.{urllib.parse.quote(str(v))}",
                method="DELETE",
                headers={"apikey": key, "Authorization": "Bearer " + key},
            )
            try:
                urllib.request.urlopen(req, timeout=20).read()
            except urllib.error.HTTPError as e:
                print(f"  cleanup {table}.{col}={v} -> {e.code} {e.read().decode()[:120]}")
    print(f"cleanup: removed bills={created['bills']} users={created['emails']}")


try:
    # --- register ---
    r = client.post("/auth/register", json={
        "email": PROV_EMAIL, "password": PASSWORD, "name": "Smoke Provider",
        "role": "provider", "facility_name": "Smoke Clinic",
    })
    print(r,"rrrrrrrrrrrrrr")
    check("register provider", r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}")
    if r.status_code in (200, 201) and r.json().get("id"):
        created["actor_ids"].append(r.json()["id"])

    r = client.post("/auth/register", json={
        "email": PAT_EMAIL, "password": PASSWORD, "name": PAT_NAME, "role": "patient",
    })
    print(r,"rrrrrrrrrrrrrr")
    check(f"register patient (name={PAT_NAME!r})", r.status_code in (200, 201),
          f"{r.status_code} {r.text[:200]}")
    if r.status_code in (200, 201) and r.json().get("id"):
        created["actor_ids"].append(r.json()["id"])

    # --- login provider ---
    r = client.post("/auth/login", json={"email": PROV_EMAIL, "password": PASSWORD})
    check("login provider", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    p_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    # --- create bill linked by patient_email ---
    r = client.post("/bills", headers=p_headers, json={
        "patient_name": PAT_NAME,
        "patient_email": PAT_EMAIL,
        "description": "Smoke test consultation",
        "amount_minor": 250000,
        "due_date": "2026-10-30",
    })
    check("create bill with patient_email -> patient_id", r.status_code == 201,
          f"{r.status_code} {r.text[:300]}")
    linked_id = r.json().get("id") if r.status_code == 201 else None
    if linked_id:
        created["bills"].append(linked_id)

    # --- create legacy bill: no email, name-only, comma in name ---
    r = client.post("/bills", headers=p_headers, json={
        "patient_name": PAT_NAME,
        "description": "Smoke test legacy bill",
        "amount_minor": 100000,
        "due_date": "2026-11-15",
    })
    check("create legacy bill (no patient_email, comma name)", r.status_code == 201,
          f"{r.status_code} {r.text[:300]}")
    legacy_id = r.json().get("id") if r.status_code == 201 else None
    if legacy_id:
        created["bills"].append(legacy_id)

    # --- patient reads their bills (the path that 400'd before) ---
    r = client.post("/auth/login", json={"email": PAT_EMAIL, "password": PASSWORD})
    print("r")
    check("login patient", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    h_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.get("/bills", headers=h_headers)
    check("patient GET /bills returns 200", r.status_code == 200,
          f"{r.status_code} {r.text[:300]}")
    ids = [b["id"] for b in r.json()] if r.status_code == 200 else []
    check("patient sees email-linked bill", linked_id in ids, ids)
    check("patient sees legacy name-only bill (comma fallback)", legacy_id in ids, ids)
    check("patient sees both, no duplicates", len(ids) == len(set(ids)), ids)

    # --- provider list ---
    r = client.get("/bills", headers=p_headers)
    check("provider GET /bills returns 200", r.status_code == 200, f"{r.status_code}")
    pids = [b["id"] for b in r.json()] if r.status_code == 200 else []
    check("provider sees both bills", linked_id in pids and legacy_id in pids, pids)

finally:
    cleanup()

print()
if failures:
    print("FAILED:", failures)
    sys.exit(1)
print("ALL CHECKS PASSED")
