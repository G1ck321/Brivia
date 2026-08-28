# Brivia — User Flow & Roles

## System Overview

Brivia is a healthcare payment coordination platform. It connects three people around a single healthcare bill:

1. **The Provider** (hospital/clinic) — creates and manages the bill
2. **The Patient** — sees the bill and shares it with supporters
3. **The Contributor** (family/friend/employer) — pays toward the bill

## The Three Roles

### Healthcare Provider (`provider@brivia.app`)
- **What they do:** Create verified healthcare bills for patients
- **What they see:** Dashboard with all bills they've created, payment progress, share links
- **Key actions:**
  - Create a bill (patient name, description, amount in NGN, due date)
  - Copy the payment link to share with the patient
  - Track which bills are funded, partially funded, or awaiting support

### Patient (`patient@brivia.app`)
- **What they do:** View their bill and share it with people who can help pay
- **What they see:** Their bill details, progress bar, QR code, share link
- **Key actions:**
  - Copy the secure payment link
  - Share it via WhatsApp, SMS, email, or QR code
  - See contributions arrive in real time

### Contributor (anyone with the link)
- **What they do:** Open the shared link and make a payment
- **What they see:** Limited bill view — description, amount needed, contribution form
- **Key actions:**
  - Enter their name (optional) and contribution amount
  - Pay via mock payment (demo) or Open Payments (production)
  - Receive a receipt with a unique payment reference

## How a Bill Flows

```
Provider creates bill
        ↓
Brivia generates BRV-XXXXXXXX (unique bill ID)
        ↓
Provider shares payment link with patient
        ↓
Patient shares link with contributors
        ↓
Contributor opens link → sees bill → pays
        ↓
Payment recorded → bill balance updates
        ↓
Provider and patient see updated status
```

## Platform Fee

Brivia takes a **2% platform fee** on every contribution. This is:
- Deducted automatically before the bill balance is updated
- Recorded in the audit log for transparency
- The contributor pays the full amount; 98% goes to the bill, 2% to Brivia

Example: Contributor pays ₦10,000
- ₦9,800 goes toward the healthcare bill
- ₦200 is the Brivia platform fee

## Running the Demo

```bash
# Terminal 1: FastAPI backend
cd brivia-backend
uvicorn main:app --reload --port 8000

# Terminal 2: Next.js frontend
cd brivia
npm run dev
```

1. Go to `http://localhost:3000`
2. Login as `provider@brivia.app` / `password123`
3. See the pre-seeded bill (BRV-CC6B2847, ₦500,000)
4. Click "Copy payment link" → open in incognito/new tab
5. See the public payment page → enter amount → Pay
6. Payment completes → receipt shown → bill balance updates

## Bill Statuses

| Status | Meaning |
|--------|---------|
| `ISSUED` | Bill created, no payments yet |
| `PARTIALLY_PAID` | Some contributions received |
| `PAID` | Fully funded — no more contributions needed |
| `CANCELLED` | Bill cancelled by provider |

## API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /auth/register` | No | Create account |
| `POST /auth/login` | No | Get JWT token |
| `GET /auth/me` | Yes | Get current user |
| `GET /bills/` | Yes | List my bills |
| `POST /bills/` | Yes | Create a bill |
| `POST /bills/{id}/share` | Yes | Generate share link |
| `GET /public/bills/{token}` | No | View bill (contributor) |
| `POST /public/bills/{token}/pay` | No | Make a contribution |
