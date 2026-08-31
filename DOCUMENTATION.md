# Brivia — Full Project Documentation

> **Care Connected, Payments Simplified**
> A healthcare payment coordination platform powered by Open Payments / Interledger.

---

## Table of Contents

1. [What Is Brivia](#what-is-brivia)
2. [How It Works (User Flow)](#how-it-works)
3. [Project Structure](#project-structure)
4. [Folder Breakdown](#folder-breakdown)
5. [Backend API Reference](#backend-api-reference)
6. [MVP Features (Investor-Ready)](#mvp-features)
7. [Demo Script (Video Walkthrough)](#demo-script)
8. [Tech Stack](#tech-stack)
9. [Environment Variables](#environment-variables)
10. [Local Setup](#local-setup)

---

## What Is Brivia

Brivia lets **healthcare providers** create verified bills, **patients** share those bills with their support network, and **contributors** (family, friends, organizations) make transparent payments against specific bills.

Every payment is recorded on-chain through Interledger/Open Payments. Brivia takes a **2% platform fee** on each contribution.

**Core problem solved:** When someone needs medical care they can't afford, the process of coordinating payments from multiple people is messy, opaque, and error-prone. Brivia makes it transparent and traceable.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        THE FLOW                              │
│                                                              │
│  1. PROVIDER creates a bill (patient name, amount, due)     │
│                    ↓                                         │
│  2. Bill gets a unique ID (BRV-XXXXXXXX) and share link     │
│                    ↓                                         │
│  3. PATIENT shares the link (QR code, URL, or Bill ID)      │
│                    ↓                                         │
│  4. CONTRIBUTOR opens link → sees limited bill view          │
│                    ↓                                         │
│  5. CONTRIBUTOR enters amount → clicks "Pay now"             │
│                    ↓                                         │
│  6. Payment processed (mock or Open Payments)                │
│                    ↓                                         │
│  7. Bill balance updates → all parties see real-time status  │
│                    ↓                                         │
│  8. When fully funded → bill marked "Funded"                 │
└─────────────────────────────────────────────────────────────┘
```

### Three Roles

| Role | What They Do | Auth Required |
|------|-------------|---------------|
| **Healthcare Provider** | Creates bills, manages payments, generates share links | Yes (JWT) |
| **Patient** | Views their bills, shares contribution links | Yes (JWT) |
| **Contributor** | Views bill via share link, makes payments | No (public link) |

---

## Project Structure

```
brivia/                          ← Root workspace
│
├── brivia/                      ← Next.js Frontend (App Router)
│   ├── app/                     ← Route pages
│   │   ├── layout.tsx           ← Root layout + Toaster
│   │   ├── page.tsx             ← / (Home — login/register)
│   │   ├── provider/create/     ← /provider/create (Provider dashboard)
│   │   ├── patient/             ← /patient (Patient dashboard)
│   │   └── pay/[token]/         ← /pay/:token (Public payment)
│   │
│   ├── components/              ← All UI components
│   │   ├── BriviaAppShell.tsx   ← Navigation shell (sidebar + mobile nav)
│   │   ├── HomePage.tsx         ← Landing + auth (login/register)
│   │   ├── ProviderDashboard.tsx← Bill management + creation
│   │   ├── PatientDashboard.tsx ← Patient bill view + share links
│   │   ├── PublicPayment.tsx    ← Contributor payment page + receipt
│   │   └── ErrorBoundary.tsx    ← Global error handler
│   │
│   ├── lib/                     ← Utilities
│   │   ├── api.ts               ← API client (all backend calls)
│   │   └── utils.ts             ← cn() helper (clsx + tailwind-merge)
│   │
│   ├── public/                  ← Static assets
│   │   ├── briv.jpg             ← Brivia logo
│   │   └── favicon.ico          ← Browser tab icon
│   │
│   ├── app/globals.css          ← All custom CSS (Brivia design system)
│   ├── next.config.ts           ← API proxy config
│   └── package.json
│
├── brivia-backend/              ← FastAPI Backend
│   ├── main.py                  ← Entry point (FastAPI app)
│   ├── seed.py                  ← Database seeder (demo users + bill)
│   ├── fix_passwords.py         ← Re-hash passwords with pwdlib
│   ├── supabase_migration.sql   ← DatabasKe schema
│   │
│   ├── app/
│   │   ├── config/              ← App configuration
│   │   │   ├── settings.py      ← Pydantic Settings (env vars)
│   │   │   ├── db.py            ← Supabase client init
│   │   │   ├── security.py      ← Password hashing (pwdlib/bcrypt)
│   │   │   └── token.py         ← JWT creation/verification (python-jose)
│   │   │
│   │   ├── routers/             ← API endpoints
│   │   │   ├── auth.py          ← POST /auth/register, /auth/login, GET /auth/me
│   │   │   ├── bills.py         ← GET/POST /bills/, GET /bills/{id}, POST /bills/{id}/share
│   │   │   ├── payments.py      ← GET /payments/bill/{id} + Open Payments endpoints
│   │   │   └── public.py        ← GET /public/bills/{token}, POST /public/bills/{token}/pay
│   │   │
│   │   ├── services/            ← Business logic
│   │   │   ├── auth_service.py  ← Register, login, user lookup
│   │   │   ├── bill_service.py  ← Create, list, share bills
│   │   │   ├── payment_service.py ← Process contributions (mock + Open Payments)
│   │   │   ├── open_payments_provider.py  ← Low-level Open Payments API (httpx)
│   │   │   └── open_payments_client.py    ← FastAPI → Node.js bridge
│   │   │
│   │   ├── schema/
│   │   │   └── schemas.py       ← Pydantic models (request/response validation)
│   │   │
│   │   └── models/              ← (Reserved for future ORM models)
│   │
│   ├── .env                     ← Secrets (Supabase, JWT, etc.)
│   └── requirements.txt         ← Python dependencies
│
├── open-payments-server/        ← Node.js Open Payments server
│   ├── server.js                ← HTTP API (FastAPI calls this via httpx)
│   ├── transfer.js              ← Standalone ILP transfer (annotated)
│   ├── simple-transfer.js       ← Simplified 2-step transfer
│   ├── test-transfer.js         ← Test script for same-wallet transfers
│   ├── package.json             ← @interledger/open-payments SDK
│   ├── README.md                ← Quick start guide
│   ├── README-7DAY.md           ← 7-day learning guide (deconstructed line-by-line)
│   └── private1.key             ← Open Payments authentication key
│
└── README.md                    ← Root README
```

---

## Folder Breakdown

### `brivia/` — Frontend (Next.js 16 App Router)

| File/Folder | Purpose |
|-------------|---------|
| `app/layout.tsx` | Root HTML shell, imports global CSS, wraps all pages with Sonner Toaster |
| `app/page.tsx` | Homepage — login form for providers and patients |
| `app/provider/create/page.tsx` | Provider dashboard — create bills, view ledger, copy share links |
| `app/patient/page.tsx` | Patient dashboard — view own bills, generate QR codes, share links |
| `app/pay/[token]/page.tsx` | Public payment page — contributors enter amount and pay |
| `components/BriviaAppShell.tsx` | Sidebar navigation + mobile bottom nav. Uses `usePathname()` for active states |
| `components/ProviderDashboard.tsx` | Full provider workspace: bill hero card, stats, bill table, create modal |
| `components/PatientDashboard.tsx` | Patient view: bill card + QR code + share link block |
| `components/PublicPayment.tsx` | Contributor flow: bill info → payment form → receipt. No auth required |
| `lib/api.ts` | All API calls — handles auth token storage (localStorage), request headers, error parsing |
| `globals.css` | Complete Brivia design system — 900+ lines of custom CSS (forest green palette, contour rails, modular cards) |
| `next.config.ts` | Rewrites `/api/*` → `localhost:8000/*` (proxy to FastAPI) |

### `brivia-backend/` — Backend (FastAPI + Supabase)

| File/Folder | Purpose |
|-------------|---------|
| `main.py` | FastAPI app: CORS, routers, health check. `redirect_slashes=False` to prevent auth header loss |
| `app/config/settings.py` | All env vars loaded via `pydantic-settings`: Supabase, JWT, Open Payments config |
| `app/config/db.py` | Supabase client singleton |
| `app/config/security.py` | Password hashing with `pwdlib[bcrypt]` — `hash_password()` and `verify_password()` |
| `app/config/token.py` | JWT with `python-jose` — `create_access_token()` and `decode_access_token()` |
| `app/routers/auth.py` | Auth endpoints: register (creates user + JWT), login (verifies password + JWT), /me |
| `app/routers/bills.py` | Bill CRUD: create (provider only), list (filtered by role), share link generation |
| `app/routers/public.py` | Public endpoints: view bill via token, contribute payment — no auth required |
| `app/routers/payments.py` | Payment listing + Open Payments integration endpoints |
| `app/services/auth_service.py` | Registration (hash + insert), login (verify + JWT), user lookup |
| `app/services/bill_service.py` | Bill creation (generates BRV-XXXXXXXX ID + share token), public bill lookup |
| `app/services/payment_service.py` | **Core payment logic**: mock provider, 2% platform fee, idempotency, audit logs, Open Payments hooks |
| `app/schema/schemas.py` | All Pydantic models: UserRegister, BillCreate, PaymentCreate, enums (UserRole, BillStatus, PaymentStatus) |
| `seed.py` | Creates demo accounts + bill in Supabase |
| `supabase_migration.sql` | Database DDL — users, bills, payments, audit_logs tables |

### `open-payments-server/` — ILP Integration (Node.js)

| File | Purpose |
|------|---------|
| `server.js` | HTTP server (port 3100) — FastAPI calls this for real ILP transfers |
| `transfer.js` | **Fully annotated** standalone transfer script — 460 lines with line-by-line comments explaining every step: client creation, wallet lookup, incoming payment grant, incoming payment creation, outgoing payment grant (interactive), quote, outgoing payment, settlement polling |
| `simple-transfer.js` | Simplified 2-step version (no quote step) |
| `test-transfer.js` | Same-wallet test for verifying connectivity |
| `README-7DAY.md` | 7-day learning guide that deconstructs the ILP flow block by block |

---

## Backend API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | No | Create account. Body: `{email, password, name, role, facility_name?}` |
| `POST` | `/auth/login` | No | Get JWT. Body: `{email, password}` |
| `GET` | `/auth/me` | Yes | Get current user profile |

### Bills (Authenticated)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/bills/` | Yes | Create bill. Body: `{patient_name, description, amount_minor, due_date}` |
| `GET` | `/bills/` | Yes | List bills (providers see own, patients see bills for them) |
| `GET` | `/bills/{id}` | Yes | Get specific bill |
| `POST` | `/bills/{id}/share` | Yes | Generate share link `{share_token, share_url}` |

### Public (No Auth)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/public/bills/{token}` | No | View limited bill info via share token |
| `POST` | `/public/bills/{token}/pay` | No | Contribute payment. Body: `{amount_minor, contributor_name?, idempotency_key}` |

### Open Payments (Authenticated)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/payments/bill/{id}/incoming` | Yes | Create incoming payment on receiver wallet |
| `POST` | `/payments/bill/{id}/outgoing-grant` | Yes | Create outgoing payment grant → returns approval URL |
| `POST` | `/payments/bill/{id}/poll` | Yes | Poll incoming payment for settlement |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | App info |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (auto-generated) |

---

## MVP Features

These are the **demo-ready, investor-visible features**:

### 1. Provider Dashboard
- ✅ Create healthcare bills with patient name, description, amount (NGN), due date
- ✅ Each bill gets a unique ID (`BRV-XXXXXXXX`)
- ✅ Visual bill hero card with progress bar, amount breakdown, status pill
- ✅ Bill table listing all active bills with status, progress, due date
- ✅ Copy payment link (clipboard) + QR code generation
- ✅ Preview pay page link

### 2. Patient Dashboard
- ✅ View all bills associated with the patient
- ✅ See real-time contribution progress
- ✅ Generate QR code for sharing
- ✅ Copy secure contribution link
- ✅ Open payment page preview

### 3. Public Payment Page (Contributor Experience)
- ✅ No login required — open share link directly
- ✅ See verified bill info (Bill ID, description, facility, due date)
- ✅ See remaining balance + progress bar
- ✅ Enter optional contributor name
- ✅ Enter contribution amount
- ✅ Idempotent payments (no double-charging on retry)
- ✅ Receipt with payment reference, timestamp, contributor name
- ✅ "Fully funded" message when bill reaches ₦0 remaining

### 4. Platform Economics
- ✅ **2% platform fee** on every contribution
- ✅ Fee recorded in audit log
- ✅ Bill balance tracks net amount (after fee)
- ✅ Example: ₦10,000 contribution → ₦9,800 to bill, ₦200 to Brivia

### 5. Security
- ✅ JWT authentication (24-hour expiry)
- ✅ bcrypt password hashing (pwdlib)
- ✅ Role-based access (provider vs patient)
- ✅ Idempotency keys prevent double-payments
- ✅ Public bill view shows limited info only (no clinical details)
- ✅ Audit trail for all payment events

### 6. Open Payments / Interledger Integration
- ✅ Real ILP testnet transfers working (transfer.js)
- ✅ Interactive grant approval flow
- ✅ Quote-based payments (avoids negative receive amount)
- ✅ Settlement polling
- ✅ Mock mode for demos without ILP connectivity
- ✅ 7-day annotated learning guide for the ILP flow

### 7. Design System
- ✅ Custom "Living Ledger" design — forest green (#0E5F4D), warm paper (#F4F6EF)
- ✅ Contour rail sidebar navigation
- ✅ Responsive: desktop sidebar → mobile bottom nav
- ✅ Brivia branding (logo, Manrope + DM Sans typography)
- ✅ Accessible (ARIA labels, focus indicators, reduced motion support)

---

## Demo Script

For a 3-5 minute investor video:

### Scene 1: The Problem (30s)
> "Healthcare costs in Nigeria are often paid out-of-pocket. When a family can't cover the full bill, they need to coordinate payments from multiple people. Today that's done via WhatsApp messages, manual bank transfers, and spreadsheets. There's no transparency, no audit trail, and no way to know if the bill is actually funded."

### Scene 2: Provider Creates a Bill (1 min)
1. Open `localhost:3000` → Login as `provider@brivia.app`
2. Show the Provider Dashboard with the seeded bill
3. Click "Create a bill" → fill in patient name, description, amount (₦500,000)
4. Bill appears with unique ID `BRV-XXXXXXXX`
5. Click "Copy payment link" → show the QR code

### Scene 3: Contributor Pays (1.5 min)
1. Open the share link in a new browser/incognito tab
2. Show the public payment page — verified bill info, balance, progress bar
3. Enter contributor name: "Dr. Chidi Okafor"
4. Enter amount: ₦25,000
5. Click "Pay now" → receipt appears with payment reference
6. Show the receipt details: bill ID, reference, timestamp, new balance

### Scene 4: Live Updates (30s)
1. Switch back to the provider dashboard
2. Show the progress bar has moved from 0% → 5%
3. Show the bill table updated with new amount
4. Switch to patient dashboard → same bill, same progress

### Scene 5: Technical Architecture (30s)
> "Under the hood, Brivia is built with Next.js App Router on the frontend, FastAPI on the backend, and Supabase for the database. Payments go through a mock provider in demo mode, but the architecture supports Open Payments / Interledger for real cross-border settlements. Every payment is idempotent, audited, and includes a 2% platform fee."

### Scene 6: Open Payments (Optional, 1 min)
1. Show `transfer.js` with annotations
2. Run `node transfer.js 100 "Healthcare bill"` on the testnet
3. Show the approval URL → approve in browser
4. Show settlement: `receivedAmount` goes from 0 → 100
5. "This is real cross-border payment settlement using ILP."

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 16 (App Router, Turbopack) | SSR-ready, file-based routing, React 19 |
| Styling | Tailwind CSS 4 + Custom CSS | Utility classes + Brivia design system |
| Routing | Next.js `useRouter` / `usePathname` | Native App Router (no wouter) |
| Backend | FastAPI (Python 3.12+) | Async, auto-docs, type-safe |
| Database | Supabase (PostgreSQL) | Managed, real-time, auth built-in |
| Auth | JWT (python-jose) + pwdlib (bcrypt) | Stateless, secure password hashing |
| Payments | Mock mode + Open Payments SDK | Demo-ready + real ILP integration |
| ILP Server | Node.js + @interledger/open-payments | Interactive grant flow, quotes, settlement |
| Deployment | Vercel (frontend) + Railway (backend) | Zero-config, auto-deploy |

---

## Environment Variables

### Frontend (`brivia/.env`)
```
NEXT_PUBLIC_API_URL=/api    # Proxied through next.config.ts rewrites
```

### Backend (`brivia-backend/.env`)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
JWT_SECRET_KEY=your-jwt-secret
CORS_ORIGINS=http://localhost:3000,https://your-domain.vercel.app
PAYMENT_PROVIDER=mock   # "mock" for demo, "openpayments" for real ILP
```

### Open Payments (`open-payments-server/`)
```
NODE_TLS_REJECT_UNAUTHORIZED=0   # Testnet only
```

---

## Local Setup

### Quick Start (3 terminals)

```bash
# Terminal 1: Backend
cd brivia-backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python seed.py                 # Creates demo users + bill
uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd brivia
npm install
npm run dev

# Terminal 3: Open Payments (optional, for real ILP)
cd open-payments-server
npm install
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

### Test the Flow

1. Go to `http://localhost:3000`
2. Login: `provider@brivia.app` / `password123`
3. See bill `BRV-CC6B2847` in the dashboard
4. Click "Copy payment link"
5. Open link in incognito → public payment page
6. Enter ₦25,000 → Pay → Receipt
7. Bill balance updates

### API Documentation

FastAPI auto-generates interactive docs at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Render Deployment

See `RENDER_DEPLOY.md` for step-by-step deployment instructions.

---

*Built for the ILP/Open Payments Workshop. August 2026.*
