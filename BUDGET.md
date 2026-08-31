# Brivia — Development & Deployment Budget (₦)

> Solo Founder Budget
> Prepared: August 31, 2026
> Target: ₦50,000 – ₦60,000 total

---

## Executive Summary

| Approach | Total | Timeline | What You Get |
|----------|-------|----------|-------------|
| **Bootstrap (Free Tiers)** | **₦50,000 – ₦60,000** | 4-6 weeks | MVP deployed, demo-ready, pilot-ready |

> **You build it yourself.** The MVP is 80% done — this budget covers deployment, a domain, and essentials only.

---

## Budget Breakdown

### 1. Development Labor — ₦0

You're building it yourself. The core platform is already functional:

| Feature | Status |
|---------|--------|
| Provider dashboard | ✅ Done |
| Patient dashboard | ✅ Done |
| Public payment page | ✅ Done |
| Auth (JWT + bcrypt) | ✅ Done |
| Bill CRUD | ✅ Done |
| 2% platform fee | ✅ Done |
| Mock payment mode | ✅ Done |
| Open Payments integration | ✅ Done |
| ILP testnet transfers | ✅ Working |

### 2. Infrastructure — ₦16,500/month

| Service | Tier | Monthly (₦) | Notes |
|---------|------|------------|-------|
| **Vercel** (Frontend) | Hobby | ₦0 | Free — unlimited deploys |
| **Render** (Backend) | Starter | ₦10,500 | FastAPI backend |
| **Supabase** (Database) | Free | ₦0 | 500MB storage, 50K rows |
| **Railway** (OP Server) | Starter | ₦7,500 | Open Payments Node.js server |
| **GitHub** | Free | ₦0 | Private repos + CI/CD |
| **Subtotal** | | **₦18,000/mo** | |

> **3-month runway:** ₦54,000
> **You can skip Railway** (OP server) for demo-only mode → saves ₦7,500/mo

### 3. Domain & Email — ₦7,500

| Item | Cost (₦) | Notes |
|------|----------|-------|
| **brivia.app** domain | ₦6,000/yr | Namecheap or Cloudflare |
| **Forwarding email** | ₦1,500/yr | hello@brivia.app → your Gmail |
| **Subtotal** | **₦7,500** | One-time (annual) |

### 4. Optional Extras — ₦0

| Item | Cost (₦) | Why Free |
|------|----------|----------|
| Error tracking | ₦0 | Sentry free tier (5K events/mo) |
| Email notifications | ₦0 | Resend free tier (3K emails/mo) |
| Analytics | ₦0 | PostHog free tier (1M events/mo) |
| SSL/HTTPS | ₦0 | Auto on Vercel + Render |
| IDE | ₦0 | VS Code or Cursor free tier |
| Design | ₦0 | Figma free tier |

---

## Budget Summary

| Category | Cost (₦) |
|----------|----------|
| Development Labor | ₦0 (you build it) |
| Infrastructure (1 month) | ₦18,000 |
| Domain + Email (annual) | ₦7,500 |
| Optional Extras | ₦0 |
| **Month 1 Total** | **₦25,500** |
| **3-Month Runway** | **₦54,000 – ₦60,000** |

---

## What ₦50-60K Gets You

### ✅ Deployed MVP
- Frontend on Vercel (brivia.app)
- Backend on Render (API)
- Database on Supabase (PostgreSQL)
- Open Payments on Railway (optional)

### ✅ Demo-Ready
- Provider can create bills
- Patients can share payment links
- Contributors can pay (mock mode)
- 2% platform fee working
- Real-time progress tracking

### ✅ Pilot-Ready (5-10 users)
- Real authentication (JWT)
- Real database (Supabase)
- Real payment flow (mock + Open Payments)
- Shareable payment links
- QR code generation

---

## How to Stretch the Budget

### Option A: Skip Open Payments Server (₦50K)
Remove Railway — run demo in mock-only mode:
- Saves ₦7,500/month
- All features work except real ILP transfers
- Perfect for investor demos

### Option B: Minimal Deploy (₦45K)
Use Render free tier (750 hrs/mo) + Vercel free:
- ₦0 infrastructure for first month
- Risk: Render sleeps after 15 min inactivity
- Fine for demos, not for 24/7 pilot

### Option C: Full Stack (₦60K)
Deploy everything, keep 3-month runway:
- Vercel (frontend) — ₦0
- Render (backend) — ₦10,500/mo
- Supabase (DB) — ₦0
- Railway (OP server) — ₦7,500/mo
- Domain — ₦6,000/yr
- **Total: ₦24,000/mo × 3 = ₦72,000** → needs ₦12K buffer

---

## Revenue Path

### Break-Even at ₦60K Budget

| Metric | Value |
|--------|-------|
| Monthly infra cost | ₦18,000 |
| Platform fee | 2% |
| Break-even volume | ₦18,000 ÷ 0.02 = **₦900,000/month** |
| Average bill | ₦55,000 |
| Bills to break even | **~17 bills/month** |

### First 3 Months (Pilot)
- 5-10 providers
- 20-50 bills created
- ₦1M-3M in volume
- ₦20K-60K in platform fees

### Month 6 (Growth)
- 30-50 providers
- 100-200 bills/month
- ₦5M-10M in volume
- ₦100K-200K in platform fees

---

## Priority Spending Order

1. **₦6,000** — Domain (brivia.app) — credibility with investors
2. **₦10,500** — Render backend — keep API running 24/7
3. **₦7,500** — Railway OP server — if showing real ILP transfers
4. **₦1,500** — Email forwarding — professional hello@brivia.app

**Total essentials: ₦25,500** (first month)
**Total with 3-month runway: ₦54,000-60,000**

---

## What NOT to Spend On

- ❌ Paid design tools (use Figma free)
- ❌ Marketing ads (get organic pilot users first)
- ❌ Custom domain email (use forwarding)
- ❌ Paid analytics (PostHog free tier is enough)
- ❌ SSL certificates (auto on Vercel/Render)
- ❌ Office space (remote-first)

---

## Recommendation

**Go with ₦55,000** — the sweet spot:

| Item | Cost (₦) |
|------|----------|
| Domain (annual) | ₦6,000 |
| Render backend (3 months) | ₦31,500 |
| Railway OP server (2 months) | ₦15,000 |
| Email forwarding | ₦1,500 |
| Buffer | ₦1,000 |
| **Total** | **₦55,000** |

This gives you:
- Real deployment for investor demos
- 3 months to find pilot users
- Real Open Payments integration
- Professional domain and email

---

*Budget prepared for bootstrapped launch*
*August 31, 2026*
