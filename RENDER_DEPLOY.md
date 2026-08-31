# Brivia — Render Deployment Guide

Deploy all three services to Render for investor demos and testing.

---

## Architecture on Render

```
┌─────────────────────────────────────────────────┐
│                  Render Services                 │
│                                                  │
│  1. brivia-frontend (Static Site)               │
│     → https://brivia-frontend.onrender.com       │
│                                                  │
│  2. brivia-api (Web Service)                    │
│     → https://brivia-api.onrender.com            │
│                                                  │
│  3. brivia-op-server (Web Service)              │
│     → https://brivia-op.onrender.com             │
│     (Optional: only for real ILP transfers)      │
└─────────────────────────────────────────────────┘
```

---

## Step 1: Deploy Backend (brivia-api)

### Create the service

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:

| Field | Value |
|-------|-------|
| **Name** | `brivia-api` |
| **Runtime** | Python |
| **Build Command** | `cd brivia-backend && pip install -r requirements.txt` |
| **Start Command** | `cd brivia-backend && uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | Free or Starter |

### Environment Variables

Add these in the **Environment** tab:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
JWT_SECRET_KEY=generate-a-secure-random-string
CORS_ORIGINS=https://brivia-frontend.onrender.com
PAYMENT_PROVIDER=mock
```

### Seed the Database

After deployment, open Shell in Render dashboard:

```bash
cd brivia-backend && python seed.py
```

This creates:
- Provider: `provider@brivia.app` / `password123`
- Patient: `patient@brivia.app` / `password123`
- Demo bill: `BRV-CC6B2847`

---

## Step 2: Deploy Frontend (brivia-frontend)

### Create the service

1. Click **New +** → **Static Site**
2. Connect your GitHub repository
3. Configure:

| Field | Value |
|-------|-------|
| **Name** | `brivia-frontend` |
| **Build Command** | `cd brivia && npm install && npm run build` |
| **Publish Directory** | `brivia/.next/static` |
| **Node Version** | `20` |

### Environment Variables

```
NEXT_PUBLIC_API_URL=https://brivia-api.onrender.com
```

### Important: Update next.config.ts

For production, update the API proxy in `brivia/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: "standalone",  // Required for Render static export
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

---

## Step 3: Deploy Open Payments Server (Optional)

Only needed if you want real ILP transfers in production.

### Create the service

1. Click **New +** → **Web Service**
2. Configure:

| Field | Value |
|-------|-------|
| **Name** | `brivia-op-server` |
| **Runtime** | Node |
| **Build Command** | `cd open-payments-server && npm install` |
| **Start Command** | `cd open-payments-server && node server.js` |
| **Instance Type** | Free or Starter |

### Environment Variables

```
NODE_TLS_REJECT_UNAUTHORIZED=0
PORT=3100
OP_WALLET_ADDRESS_URL=https://ilp.interledger-test.dev/practice
OP_KEY_ID=7081bbed-1e3e-416d-b4b5-981b3993be68
```

> **⚠️ Security note:** `NODE_TLS_REJECT_UNAUTHORIZED=0` is required because the Interledger testnet uses self-signed TLS certificates. This is safe for testnet only. In production with real wallets, remove this and use proper certificate verification.
>
> **⚠️ Private key:** Render doesn't support file mounts. You need to either:
> - Store the private key as an env var and write it to disk at startup
> - Or embed it in the repo (fine for testnet, NOT for production)
>
> **Quick workaround — add to Start Command:**
> ```
> cd open-payments-server && echo "$OP_PRIVATE_KEY" > private1.key && node server.js
> ```
> Then add `OP_PRIVATE_KEY` as a Render env var with the full private key content.

### Update Backend Settings

In `brivia-backend/.env`, set the OP server URL:

```
OP_SERVER_URL=https://brivia-op.onrender.com
```

---

## Step 4: Custom Domains (Optional)

1. In Render dashboard → your service → **Settings** → **Custom Domains**
2. Add your domain (e.g., `brivia.app`, `api.brivia.app`)
3. Update DNS records as instructed by Render
4. Update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` with new domains

---

## Deployment Checklist

### Demo Mode (mock payments)
- [ ] Supabase project created with tables from `supabase_migration.sql`
- [ ] Backend deployed with `PAYMENT_PROVIDER=mock`
- [ ] Database seeded (`python seed.py`)
- [ ] Frontend deployed with `NEXT_PUBLIC_API_URL` pointing to backend
- [ ] Login test: `provider@brivia.app` / `password123`
- [ ] Bill creation test
- [ ] Payment link share test (open in incognito)
- [ ] Mock contribution test

### Production Mode (real ILP transfers)
- [ ] All demo mode items above
- [ ] Open Payments server deployed with `NODE_TLS_REJECT_UNAUTHORIZED=0`
- [ ] Private key embedded (via env var workaround above)
- [ ] Backend env vars include `OP_SERVER_URL` and `OP_RECEIVING_WALLET_URL`
- [ ] Backend env vars set `PAYMENT_PROVIDER=openpayments`
- [ ] Test: create bill → copy payment link → select Open Payments → approve in wallet
- [ ] Test: verify funds arrive on receiver wallet via https://ilp.interledger-test.dev/practice

---

## Common Issues

### "Failed to load bills" (404/401)
- Check `NEXT_PUBLIC_API_URL` is correct
- Check backend is running and `/health` returns `{"status":"ok"}`
- Check `CORS_ORIGINS` includes your frontend URL

### Build fails on Render
- Make sure `requirements.txt` includes all dependencies
- Check Python version (3.12+ recommended)
- For Node.js: check `package.json` has correct `engines` field

### Supabase connection fails
- Use the **service_role** key for backend (not the anon key)
- Check Supabase project is not paused (free tier sleeps after inactivity)

### Redirect loop / 307 errors
- Backend has `redirect_slashes=False` — this is correct
- If you see 307s, the backend may have been deployed without this setting

---

## Cost Estimate (Render)

| Service | Instance | Monthly Cost |
|---------|----------|-------------|
| Frontend (Static) | Free | $0 |
| Backend (Web Service) | Starter | $7 |
| Open Payments (Web Service) | Starter | $7 |
| **Total** | | **$14/month** |

Free tier works for demos but services spin down after 15 min of inactivity.

---

*Deployed with Render. August 2026.*
