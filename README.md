# Brivia

**Care connected, payments simplified.**

Brivia is a healthcare payment coordination platform. A provider issues a verified bill, the patient shares one link with the people who want to help, and contributors pay toward that specific bill from their own wallet over **Open Payments / Interledger**. Every naira is attributable: who paid, how much, which bill, which receipt.

> Status: working MVP on the Interledger **testnet** (`ilp.interledger-test.dev`). Real wallets, mock mode for demos. Not audited for production money movement.

---

## The problem

Healthcare is often paid out of pocket, and one bill is rarely covered by one person. In practice a family coordinates support across WhatsApp, bank transfers and screenshots. That leaves three gaps:

| Who | What they cannot answer today |
|-----|-------------------------------|
| Patient | "How much is still owed, and who already paid?" |
| Contributor | "Did my money reach *this* bill, or just this person's account?" |
| Provider | "Is this bill actually funded, and can I reconcile it?" |

Brivia replaces the group chat and the spreadsheet with a bill-scoped payment link: contributors pay *into the bill*, not into a personal account, and the balance is visible to everyone who is allowed to see it.

---

## Why Open Payments

Open Payments gives us wallet-to-wallet settlement over Interledger with a consent step the payer controls:

- **No card rails, no stored card data.** The contributor's own wallet authorises the transfer.
- **Explicit, bounded consent.** The payer approves a GNAP grant limited to a debit amount for one bill, not a blanket debit mandate.
- **Cross-border by design.** A relative abroad can fund a bill at home in their own currency; the quote shows the converted amount before approval.
- **Verifiable receipts.** The incoming payment on the provider's wallet is the source of truth for "did funds land".
- **Fee transparency.** Our platform fee is computed and recorded per contribution, not baked into an FX spread.

---

## How it works

```
Provider                    Brivia                        Contributor
   │                          │                                │
   │  create bill             │                                │
   ├─────────────────────────►│  BRV-XXXXXXXX + share token    │
   │                          │                                │
   │        share link / QR to patient ──────────────────────► │
   │                          │  open /pay/{token}             │
   │                          │◄───────────────────────────────┤
   │                          │  amount + wallet address       │
   │                          │  incoming-payment grant        │
   │                          │  quote  →  outgoing-payment    │
   │                          │  grant (interactive)           │
   │                          ├───────────────────────────────►│  approve in wallet
   │                          │◄───────────── interact_ref ────┤
   │                          │  continue grant                │
   │                          │  create outgoing payment       │
   │                          │  incoming payment settles      │
   │◄───── balance + receipt ─┤                                │
```

### Roles

| Role | Does | Auth |
|------|------|------|
| **Provider** (clinic/hospital) | Issues bills, tracks funding, shares links | JWT |
| **Patient** | Sees own bills, shares the contribution link | JWT |
| **Contributor** (family, friend, employer) | Opens the link and pays — no account needed | Share token only |

Bill lifecycle: `ISSUED → PARTIALLY_PAID → PAID` (also `OVERDUE`, `CANCELLED`). Payment lifecycle: `CREATED → INITIATED → COMPLETED` (or `FAILED`, `REFUNDED`).

---

## Technical overview

### Architecture

```
brivia/                     Next.js 16 App Router — provider, patient, public pay pages
   │  /api/* rewrite
brivia-backend/             FastAPI — auth, bills, public contributions, fee + audit logic
   │  httpx
open-payments-server/       Node.js — @interledger/open-payments SDK, GNAP grants
   │
   ├─ Supabase (Postgres)   users, bills, payments, bill_shares, audit_logs
   └─ Interledger testnet   wallet addresses, quotes, incoming/outgoing payments
```

The Node service exists because the Open Payments SDK handles client authentication, grant continuation and response validation correctly out of the box; FastAPI orchestrates business rules and calls it over HTTP.

### Payment flow, technically

1. **Incoming payment** on the receiving wallet: request an `incoming-payment` grant (`create`, `read`), then create the incoming payment with bill metadata. Its URL is stored on the bill.
2. **Quote**: request a `quote` grant, then create a quote for `debitAmount` → `receiveAmount`. This is what prevents a negative receive amount from ILP fees.
3. **Outgoing payment grant**: request `outgoing-payment` (`create`) with `limits.debitAmount` from the quote, `interact.start = redirect` and `interact.finish = redirect` back to `/pay/{token}/callback?payment_id=...`.
4. **Approval**: the contributor approves in their own wallet; the authorization server redirects back with `interact_ref`.
5. **Finalize**: continue the grant with `interact_ref` (GNAP rejects the continuation without it), then create the outgoing payment against the incoming payment URL.
6. **Settlement**: the callback updates `payments` and `bills`; `POST /public/bills/{token}/pay/callback` is idempotent, so a retry returns the completed receipt rather than double-paying.

Mock mode (`PAYMENT_PROVIDER=mock`) runs steps 1–6 as a local simulation with a `MOCK-…` external ID so demos work without testnet connectivity.

### Fees

Per contribution, in minor units (kobo):

```
fee       = ceil(amount * 0.003) + 5000    # 0.3% + ₦50
net       = amount - fee                    # credited to the bill
```

Capped at the contribution amount, and every fee is written to `audit_logs` as `PLATFORM_FEE`. The bill tracks `amount_paid_minor` net of fees.

### Data model (minimal)

- `users` — role (`provider`/`patient`), facility, password hash
- `bills` — `public_bill_id`, provider, patient, `amount_minor`, `amount_paid_minor`, `remaining_balance_minor`, status, due date, `external_payment_id` (incoming payment URL)
- `payments` — bill, contributor name, amount, status, `payment_reference`, unique `idempotency_key`
- `bill_shares` — `share_token` (40 chars) for the public link
- `audit_logs` — `PAYMENT_CREATED`, `OPEN_PAYMENTS_INITIATED`, `PAYMENT_COMPLETED`, `PLATFORM_FEE`

Amounts are integers in minor units everywhere. No floats touch money.

### API surface

| Method | Endpoint | Auth |
|--------|----------|------|
| `POST` | `/auth/register`, `/auth/login` | — |
| `GET` | `/auth/me` | JWT |
| `GET`/`POST` | `/bills/` | JWT |
| `GET` | `/bills/{id}`, `/bills/{id}/payments` | JWT |
| `POST` | `/bills/{id}/share` | JWT |
| `GET` | `/public/bills/{token}` | share token |
| `POST` | `/public/bills/{token}/pay` | share token (mock) |
| `POST` | `/public/bills/{token}/pay/open-payments` | share token → returns wallet approval URL |
| `GET` | `/public/bills/{token}/pay/callback` | share token → finalizes + receipt |
| `POST` | `/payments/bill/{id}/incoming` \| `/outgoing-grant` \| `/poll` | JWT |
| `GET` | `/health` | — |

Interactive docs: `http://localhost:8000/docs`.

### Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 (App Router, React 19), Tailwind CSS 4, custom "Living Ledger" design system |
| Backend | FastAPI, Pydantic v2, pydantic-settings |
| Auth | JWT (python-jose) + bcrypt (pwdlib) |
| Database | Supabase (PostgreSQL) |
| Payments | Open Payments via `@interledger/open-payments` (Node 20), GNAP grants, ILP testnet |
| Deploy | Render (frontend static, FastAPI, OP server) — see `RENDER_DEPLOY.md` |

---

## Run it locally

Three terminals.

```bash
# 1. Backend (http://localhost:8000)
cd brivia-backend
python -m venv venv && venv\Scripts\activate      # Windows; source venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python seed.py                                     # demo users + one bill
uvicorn main:app --reload --port 8000

# 2. Frontend (http://localhost:3000)
cd brivia
npm install
npm run dev

# 3. Open Payments server (http://localhost:3100) — only for real testnet transfers
cd open-payments-server
npm install
npm run dev
```

If you use `.env` for the OP server, note that Wrangler-style `.dev.vars` habits do not apply here; local dev reads `private1.key` or `OP_PRIVATE_KEY`.

### Environment variables

`brivia-backend/.env`

```ini
SUPABASE_URL=
SUPABASE_KEY=                 # anon key
SUPABASE_SERVICE_KEY=         # service-role key, server only
JWT_SECRET_KEY=
CORS_ORIGINS=http://localhost:3000
PAYMENT_PROVIDER=mock         # mock | openpayments

OP_SERVER_URL=http://localhost:3100
OP_RECEIVING_WALLET_URL=https://ilp.interledger-test.dev/practice
OP_WALLET_ADDRESS_URL=
OP_KEY_ID=
OP_PRIVATE_KEY_PATH=private.key
```

`open-payments-server/` — `OP_KEY_ID`, `OP_WALLET_ADDRESS_URL`, `OP_RECEIVING_WALLET_URL`, and either `OP_PRIVATE_KEY` (PEM, escaped newlines allowed) or a local key file. `NODE_TLS_REJECT_UNAUTHORIZED=0` is testnet-only and must never ship to production.

`brivia/.env.local` — `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000` via `/api/*` rewrites).

### Demo accounts

`provider@brivia.app` / `password123` · `patient@brivia.app` / `password123`

### Test the flow

1. Log in as the provider, open the seeded bill, copy the payment link.
2. Open the link in a private window — no login required.
3. Mock mode: enter amount → receipt. Open Payments: paste your wallet address, approve in the wallet tab, land back on the receipt.
4. Refresh the provider dashboard: balance, status and progress have moved.

---

## Repository map

| Path | What's in it |
|------|--------------|
| `brivia/` | Next.js app: `/`, `/auth`, `/provider/create`, `/patient`, `/bills/[id]`, `/pay/[token]`, `/pay/[token]/callback`, `/settings` |
| `brivia-backend/` | FastAPI app, routers, services, Supabase schema in `supabase_migration.sql`, `seed.py` |
| `open-payments-server/` | OP HTTP API (`server.js`), annotated transfer scripts, 7-day learning guide |
| `DOCUMENTATION.md` | Long-form reference |
| `USER_FLOW.md` | Role-by-role walkthrough |
| `RENDER_DEPLOY.md`, `render.yaml` | Deployment guide and blueprint |
| `BUDGET.md` | Running-cost plan |

---

## Known limitations

Honest list before anyone treats this as production:

- **Testnet only.** No production wallet, no KYC, no licensing.
- **Grant state lives in `audit_logs` / an in-memory `Map`** in the OP server. A restart or a second instance loses pending grants; move this to Postgres or Redis.
- **No webhooks.** Settlement is a callback plus polling; a background reconciler is needed for payments that settle after the browser tab closes.
- **One receiving wallet per deployment.** Multi-tenant provider payouts are not modelled yet.
- **No automated tests.** Verification is manual.
