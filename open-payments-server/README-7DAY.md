# Brivia Open Payments — 7-Day Learning Guide

> A day-by-day breakdown of how Brivia uses Interledger/Open Payments
> to process healthcare bill contributions.

---

## Table of Contents

- [Day 1: The Big Picture](#day-1-the-big-picture)
- [Day 2: Wallets & Authentication](#day-2-wallets--authentication)
- [Day 3: Grants — The Permission System](#day-3-grants--the-permission-system)
- [Day 4: Incoming Payments](#day-4-incoming-payments)
- [Day 5: Quotes — Calculating Fees](#day-5-quotes--calculating-fees)
- [Day 6: Outgoing Payments — Money Moves](#day-6-outgoing-payments--money-moves)
- [Day 7: Settlement & Polling](#day-7-settlement--polling)
- [Hosting Guide](#hosting-guide)
- [Demo Video Script](#demo-video-script)

---

## Day 1: The Big Picture

### What is Brivia?

Brivia is a healthcare payment coordination platform. When a patient needs
medical care, the cost is often shared by multiple people — family, friends,
employers. Brivia makes this transparent and trackable.

### The Core Flow

```
Provider creates bill
        ↓
Brivia generates unique Bill ID (BRV-XXXXXXXX)
        ↓
Patient shares payment link
        ↓
Contributor opens link, enters amount
        ↓
Brivia backend calls Open Payments
        ↓
Money moves via Interledger network
        ↓
Bill balance updates, everyone sees the new status
```

### Key Files

| File | Purpose |
|------|---------|
| `transfer.js` | The Open Payments payment engine (annotated) |
| `server.js` | HTTP wrapper that Brivia's FastAPI calls |
| `simple-transfer.js` | Minimal version for learning |
| `test-transfer.js` | Test script for debugging |

### What You Need

1. A Rafiki wallet (https://rafiki.money)
2. A private key (downloaded from Rafiki dashboard)
3. Node.js 18+ installed
4. `@interledger/open-payments` SDK

---

## Day 2: Wallets & Authentication

### What is a Wallet?

An Interledger wallet is like a bank account on the open internet.
It has:

- **Public URL**: `https://ilp.interledger-test.dev/practice`
- **Currency**: EUR, USD, etc.
- **Asset Scale**: Decimal places (2 for cents)
- **Auth Server**: Where you get permission tokens
- **Resource Server**: Where you create payments

### The Three Roles

```
CLIENT ──────► Authenticates with the SDK
  │            (your identity, key must match)
  │
SENDER ──────► Pays the money
  │            (user approves via browser)
  │
RECEIVER ────► Gets the money
               (incoming payment created here)
```

### Why Three Different Wallets?

In the real world:
- **Client** = Brivia's system (authenticates as itself)
- **Sender** = The contributor (pays from their wallet)
- **Receiver** = The patient (receives into their wallet)

For testing, all three can be on the same Rafiki instance.

### Code Walkthrough (Lines 19-30)

```javascript
const PRIVATE_KEY = readFileSync("private1.key", "utf8");
const KEY_ID = "7081bbed-1e3e-416d-b4b5-981b3993be68";

const CLIENT_WALLET   = "https://ilp.interledger-test.dev/practice";
const SENDER_WALLET   = "https://ilp.interledger-test.dev/euroanna";
const RECEIVER_WALLET = "https://ilp.interledger-test.dev/41fe8576";
```

- `PRIVATE_KEY`: Your wallet's secret key (never share this!)
- `KEY_ID`: Identifies which key you're using
- `CLIENT_WALLET`: Must match the wallet your key is registered to
- `SENDER_WALLET`: Where money comes from
- `RECEIVER_WALLET`: Where money goes

---

## Day 3: Grants — The Permission System

### What is a Grant?

A grant is like a session token, but for specific actions.
Instead of "you can do anything", it says "you can do THIS specific thing."

### Grant Types in Open Payments

| Grant Type | What It Lets You Do |
|------------|---------------------|
| `incoming-payment` | Create/read/complete incoming payments |
| `outgoing-payment` | Create outgoing payments (with spending limit) |
| `quote` | Get payment quotes (fee calculations) |

### How Grants Work

```
1. You request: "I want to create incoming payments"
2. Auth server responds: "OK, here's a token (access_token)"
3. You use that token for subsequent API calls
4. Token expires after ~10 minutes
5. Request a new one when it expires
```

### Code Walkthrough (Lines 156-170)

```javascript
const incGrant = await client.grant.request(
  { url: receiver.authServer },
  {
    access_token: {
      access: [{
        type: "incoming-payment",
        actions: ["create", "read", "complete"],
      }],
    },
  }
);
```

- `receiver.authServer`: The auth server for the receiver's wallet
- `type: "incoming-payment"`: What resource we want
- `actions: ["create", "read", "complete"]`: What we want to do

### Interactive vs Non-Interactive Grants

Some grants require user approval (interactive):

```javascript
// Non-interactive (automatic)
const incGrant = await client.grant.request(url, { access_token: {...} });

// Interactive (requires browser redirect)
const outGrant = await client.grant.request(url, {
  access_token: {...},
  interact: { start: ["redirect"] }  // <-- This makes it interactive
});
```

Outgoing payments always require interactive approval because
the user must explicitly authorize spending their money.

---

## Day 4: Incoming Payments

### What is an Incoming Payment?

An incoming payment is a "slot" on the receiver's wallet that
says "I'm expecting money." It's like creating an invoice.

### Why We Don't Set `incomingAmount`

```javascript
const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: incGrant.access_token.value },
  {
    walletAddress: receiver.id,
    metadata: { description },
    // NO incomingAmount!
  }
);
```

If we set `incomingAmount: 10000` (100 EUR):
- Connector charges ~4% fees
- Only 96 EUR arrives
- `receivedAmount` = 9600, but we wanted 10000
- Payment stays `completed: false` forever!

Without `incomingAmount`:
- Any amount that arrives counts
- Payment completes immediately
- We handle the "right amount" logic in our app

### The Incoming Payment Object

```javascript
{
  id: "https://.../incoming-payments/abc123",
  walletAddress: "https://ilp.interledger-test.dev/41fe8576",
  receivedAmount: { value: "0", assetCode: "EUR", assetScale: 2 },
  completed: false,
  metadata: { description: "Brivia payment" },
  methods: [{
    type: "ilp",
    ilpAddress: "local.test...",
    sharedSecret: "..."
  }]
}
```

The `methods` array contains the ILP connection details that the
sender's connector uses to route the payment.

---

## Day 5: Quotes — Calculating Fees

### What is a Quote?

A quote answers: "If I send X, how much will the receiver get?"

### Why Quotes Matter

Without a quote, you might get:
- "negative receive amount" error
- Incorrect fee calculations
- Payment routed to wrong destination

### The Quote Flow

```
1. Request quote grant (permission to create quotes)
2. Create quote with:
   - sender wallet
   - incoming payment URL (destination)
   - debit amount (how much to send)
3. Get back:
   - debitAmount: what sender pays
   - receiveAmount: what receiver gets
   - method: "ilp"
```

### Code Walkthrough (Lines 195-220)

```javascript
const quote = await client.quote.create(
  { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
  {
    walletAddress: sender.id,
    receiver: incomingPayment.id,
    debitAmount: {
      value: amountInBaseUnits,
      assetCode: sender.assetCode,
      assetScale: sender.assetScale,
    },
    method: "ilp",
  }
);
```

### Example Quote Result

```javascript
{
  debitAmount:  { value: "10400", assetCode: "EUR", assetScale: 2 },
  receiveAmount: { value: "10000", assetCode: "EUR", assetScale: 2 },
  method: "ilp"
}
```

Translation:
- Sender pays: 104.00 EUR
- Receiver gets: 100.00 EUR
- Fee: 4.00 EUR (3.85%)

---

## Day 6: Outgoing Payments — Money Moves

### What is an Outgoing Payment?

An outgoing payment is the actual transfer of money from
sender to receiver. This is where the ILP network kicks in.

### The Approval Flow

```
1. Request outgoing payment grant
2. Auth server says: "User must approve"
3. Auth server gives redirect URL
4. User opens URL in browser
5. User clicks "Approve"
6. Auth server redirects back
7. We poll until grant is finalized
8. Use finalized grant to create payment
```

### Code Walkthrough (Lines 248-290)

```javascript
// Request the grant
const outGrant = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [{
        type: "outgoing-payment",
        actions: ["create"],
        limits: { debitAmount: quote.debitAmount },  // Max spend
        identifier: sender.id,
      }],
    },
    interact: { start: ["redirect"] },
  }
);

// Show approval URL
console.log(`Approve payment here: ${outGrant.interact.redirect}`);

// Wait for approval (poll every 1 second)
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const res = await client.grant.continue({
    url: outGrant.continue.uri,
    accessToken: outGrant.continue.access_token.value,
  });
  if (res.access_token) { finalizedGrant = res; break; }
}

// Create the payment
const outgoingPayment = await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken: finalizedGrant.access_token.value },
  { walletAddress: sender.id, quoteId: quote.id, metadata: { description } }
);
```

### The `limits` Field

```javascript
limits: { debitAmount: quote.debitAmount }
```

This ensures the grant can't be used for more than the quoted amount.
It's like setting a spending limit on a credit card.

---

## Day 7: Settlement & Polling

### What is Settlement?

Settlement is the process of money actually moving through
the ILP network. It's asynchronous — not instant.

### The Settlement Process

```
1. Outgoing payment created → money leaves sender's wallet
2. ILP packets travel through connectors
3. Receiver's connector accepts packets
4. receivedAmount increases on incoming payment
5. Payment completes when target is met (or anytime if no target)
```

### Why We Poll

```javascript
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 2000));

  const updated = await client.incomingPayment.get({
    url: incomingPayment.id,
    accessToken: incGrant.access_token.value,
  });

  const received = updated.receivedAmount?.value || "0";
  console.log(`Poll ${i + 1}: Received ${received} base units`);

  if (parseInt(received) > 0) {
    await client.incomingPayment.complete({
      url: incomingPayment.id,
      accessToken: incGrant.access_token.value,
    });
    console.log(`Success! Received: ${received} units`);
    process.exit(0);
  }
}
```

### Polling Strategy

- Check every 2 seconds (balance between speed and server load)
- Max 20 attempts (40 seconds total)
- Exit immediately when funds arrive
- Force-complete the payment to close it

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `completed: false` forever | Set `incomingAmount` but fees eat some | Don't set `incomingAmount` |
| `fetch failed` | TLS certificate rejection | Set `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `invalid_client` | Key not registered to CLIENT wallet | Use correct CLIENT_WALLET |
| `negative receive amount` | Missing quote step | Always create quote before payment |

---

## Hosting Guide

### Option 1: Railway (Recommended for Demo)

**Open Payments Server (Node.js):**
```bash
# 1. Push to GitHub
cd brivia-backend/open-payments-server
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOU/brivia-op.git
git push -u origin main

# 2. Deploy on Railway
# - Go to railway.app
# - New Project → Deploy from GitHub
# - Select your repo
# - Add environment variable: NODE_TLS_REJECT_UNAUTHORIZED=0
# - Railway gives you a URL like: https://brivia-op.up.railway.app
```

**FastAPI Backend:**
```bash
# 1. Push to GitHub
cd brivia-backend
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOU/brivia-api.git
git push -u origin main

# 2. Deploy on Railway
# - New Project → Deploy from GitHub
# - Add environment variables:
#   SUPABASE_URL=your_url
#   SUPABASE_KEY=your_key
#   JWT_SECRET=your_secret
#   OP_SERVER_URL=https://brivia-op.up.railway.app
```

**Next.js Frontend:**
```bash
# 1. Push to GitHub
cd brivia
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOU/brivia-web.git
git push -u origin main

# 2. Deploy on Vercel
# - Go to vercel.com
# - Import GitHub repo
# - Add environment variable: NEXT_PUBLIC_API_URL=https://brivia-api.up.railway.app
```

### Option 2: Local Demo (Tomorrow)

```bash
# Terminal 1: Open Payments
cd brivia-backend/open-payments-server
NODE_TLS_REJECT_UNAUTHORIZED=0 node transfer.js 100 "Healthcare bill"

# Terminal 2: FastAPI
cd brivia-backend
uvicorn main:app --reload --port 8000

# Terminal 3: Next.js
cd brivia
npm run dev
```

### Port Configuration

| Service | Port | URL |
|---------|------|-----|
| Open Payments | 3100 | http://localhost:3100 |
| FastAPI | 8000 | http://localhost:8000 |
| Next.js | 3000 | http://localhost:3000 |

---

## Demo Video Script

### Opening (30 seconds)

> "Hi, I'm [Name], and this is Brivia — a healthcare payment
> coordination platform built on Interledger. Let me show you
> how it works."

### Part 1: Provider Creates Bill (1 minute)

1. Open `http://localhost:3000`
2. Log in as provider
3. Create a new bill:
   - Patient: John Doe
   - Description: Surgery consultation
   - Amount: 500 EUR
4. Show the generated Bill ID: `BRV-CC6B2847`
5. Copy the payment link

> "The provider creates a bill, and Brivia generates a unique
> Bill ID and a shareable payment link. No sensitive medical
> data is exposed."

### Part 2: Contributor Pays (2 minutes)

1. Open the payment link in a new tab
2. Show the public payment page:
   - Bill ID
   - Provider name
   - Amount due
   - Payment form
3. Enter contribution amount: 100 EUR
4. Click "Pay"
5. Show the Open Payments redirect:
   > "This is where Interledger kicks in. The contributor
   > is redirected to their wallet to approve the payment."
6. Approve the payment in the wallet
7. Show the payment confirmation

> "The payment goes through the Interledger network.
> The contributor's wallet sends 100 EUR, and after
> a small network fee, the provider receives it."

### Part 3: Settlement & Updates (1 minute)

1. Show the polling output in the terminal
2. Show the bill balance updating in real-time
3. Show the provider dashboard:
   - Bill amount: 500 EUR
   - Amount paid: 100 EUR
   - Remaining: 400 EUR
4. Show the payment receipt

> "The settlement happens in seconds. Both the provider
> and patient see the updated balance immediately."

### Part 4: Technical Highlights (1 minute)

1. Show the annotated `transfer.js`
2. Explain the 6-step flow:
   - Authenticated client
   - Incoming payment
   - Quote
   - Outgoing payment grant
   - Payment execution
   - Settlement polling

> "The entire payment flow is handled by 6 clean steps.
> Each step is fully annotated in the codebase for
> learning purposes."

### Closing (30 seconds)

> "Brivia proves that healthcare payments can be
> transparent, trackable, and built on open standards.
> The Interledger integration means no vendor lock-in
> — any wallet can pay any other wallet. Thank you."

### Demo Checklist

- [ ] All three services running
- [ ] Provider login working
- [ ] Bill creation working
- [ ] Payment link generation
- [ ] Public payment page loading
- [ ] Open Payments redirect working
- [ ] Wallet approval working
- [ ] Settlement completing
- [ ] Balance updates showing
- [ ] Terminal logs visible

### Backup Plan

If something fails during the demo:

1. **Payment fails**: Use `simple-transfer.js` directly
2. **Backend down**: Show the annotated code
3. **Frontend broken**: Use the FastAPI docs at `/docs`
4. **TLS error**: Already fixed with `NODE_TLS_REJECT_UNAUTHORIZED=0`

---

## Quick Reference

### Useful Commands

```bash
# Test wallet connectivity
curl -sk https://ilp.interledger-test.dev/practice

# Run transfer script
cd brivia-backend/open-payments-server
NODE_TLS_REJECT_UNAUTHORIZED=0 node transfer.js 100 "Test"

# Start all services
# Terminal 1
cd brivia-backend/open-payments-server && npm run dev

# Terminal 2
cd brivia-backend && uvicorn main:app --reload --port 8000

# Terminal 3
cd brivia && npm run dev
```

### Environment Variables

```bash
# .env (brivia-backend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
JWT_SECRET=your-jwt-secret
OP_SERVER_URL=http://localhost:3100
```

### Common Errors

| Error | Solution |
|-------|----------|
| `fetch failed` | Add `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `invalid_client` | Check CLIENT_WALLET matches key registration |
| `negative receive amount` | Add quote step before payment |
| `completed: false` | Don't set `incomingAmount` |
| `401 Unauthorized` | Re-login, token expired |

---

## Further Reading

- [Open Payments Spec](https://openpayments.dev/)
- [Interledger Protocol](https://interledger.org/)
- [Rafiki Documentation](https://rafiki.dev/)
- [Brivia API Docs](http://localhost:8000/docs) (when running locally)

---

*Last updated: August 2026*
*Brivia MVP — Built with ❤️ for healthcare transparency*
