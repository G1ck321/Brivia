"""End-to-end smoke test: registered-patient bill linking.

Run against a local uvicorn on 127.0.0.1:8017. Creates clearly-labelled
scratch users/bills and deletes them again at the end.
"""

import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = "http://127.0.0.1:8017"
SUFFIX = uuid.uuid4().hex[:8]
PAT_NAME = "Okafor, Chidi"  # comma: the case that used to 400
FAILURES = []


def call(path, method="GET", body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("" if ok else f"  <- {detail}"))
    if not ok:
        FAILURES.append(label)


# --- 1. register provider + two patients -------------------------------------
prov_email = f"smoke-prov-{SUFFIX}@example.com"
pat_email = f"smoke-pat-{SUFFIX}@example.com"

st, prov = call("/auth/register", "POST", {
    "email": prov_email, "password": "smoketest123", "name": "Smoke Provider",
    "role": "provider", "facility_name": "Smoke Clinic",
})
check("register provider", st == 201, (st, prov))
prov_tok = (prov or {}).get("access_token")

st, pat = call("/auth/register", "POST", {
    "email": pat_email, "password": "smoketest123", "name": PAT_NAME, "role": "patient",
})
check("register patient (comma in name)", st == 201, (st, pat))
pat_tok = (pat or {}).get("access_token")
pat_id = ((pat or {}).get("user") or {}).get("id")

# --- 2. provider creates a bill linked by patient_email ----------------------
st, bill = call("/bills", "POST", {
    "patient_name": PAT_NAME, "patient_email": pat_email,
    "description": "Smoke test consultation", "amount_minor": 500000,
    "currency": "NGN", "due_date": "2026-10-30",
}, token=prov_tok)
check("create bill with patient_email", st == 201, (st, bill))
linked_id = (bill or {}).get("id")
check("created bill echoes patient name", (bill or {}).get("patient_name") == PAT_NAME, bill)

# --- 3. provider creates a legacy bill (no patient_email) --------------------
st, legacy = call("/bills", "POST", {
    "patient_name": PAT_NAME, "description": "Smoke test legacy bill",
    "amount_minor": 250000, "currency": "NGN", "due_date": "2026-11-15",
}, token=prov_tok)
check("create legacy bill without patient_email", st == 201, (st, legacy))
legacy_id = (legacy or {}).get("id")

# --- 4. patient lists bills: linked + legacy must both appear ----------------
st, mine = call("/bills", token=pat_tok)
ids = [b.get("id") for b in (mine or [])]
check("patient bill list is 200", st == 200, (st, mine))
check("linked bill visible to patient", linked_id in ids, ids)
check("legacy name-only bill visible too", legacy_id in ids, ids)
check("list deduped", len(ids) == len(set(ids)), ids)

# --- 5. db-level: patient_id actually stored --------------------------------
import os
from dotenv import load_dotenv

load_dotenv("brivia-backend/.env")
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_KEY"]


def rest(path):
    r = urllib.request.Request(URL + "/rest/v1/" + path,
                               headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:200]


st, row = rest(f"bills?select=patient_id&id=eq.{linked_id}")
check("patient_id persisted on linked bill",
      st == 200 and row and row[0].get("patient_id") == pat_id, (st, row))
st, row = rest(f"bills?select=patient_id&id=eq.{legacy_id}")
check("patient_id null on legacy bill",
      st == 200 and row and row[0].get("patient_id") is None, (st, row))

# --- 6. platform fee maths ---------------------------------------------------
sys.path.insert(0, "brivia-backend")
from app.services.payment_service import calculate_platform_fee  # noqa: E402

check("fee: 0.3% + ₦50 on ₦5,000", calculate_platform_fee(500000) == 1500 + 5000,
      calculate_platform_fee(500000))
check("fee never exceeds the amount", calculate_platform_fee(10) == 10,
      calculate_platform_fee(10))

# --- 7. cleanup --------------------------------------------------------------
_, shares = rest(f"bill_shares?select=id&bill_id=in.({linked_id},{legacy_id})")
if shares:
    for s in shares:
        rest(f"bill_shares?id=eq.{s['id']}").__class__  # noqa: B018
        rq = urllib.request.Request(
            URL + f"/rest/v1/bill_shares?id=eq.{s['id']}", method="DELETE",
            headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
        urllib.request.urlopen(rq, timeout=30).read()
for bid in (linked_id, legacy_id):
    rq = urllib.request.Request(URL + f"/rest/v1/bills?id=eq.{bid}", method="DELETE",
                                headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    urllib.request.urlopen(rq, timeout=30).read()

st, left = rest(f"users?select=id&email=in.('{prov_email}','{pat_email}')")
if left:
    for u in left:
        rq = urllib.request.Request(URL + f"/rest/v1/users?id=eq.{u['id']}", method="DELETE",
                                    headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
        urllib.request.urlopen(rq, timeout=30).read()
st, left = rest(f"users?select=id&email=in.('{prov_email}','{pat_email}')")
check("scratch data cleaned up", left == [], left)

print()
print(f"{len(FAILURES)} failure(s)" if FAILURES else "ALL CHECKS PASSED")
sys.exit(1 if FAILURES else 0)
