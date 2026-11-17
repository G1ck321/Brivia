# Care Circle (v2)

Branch: `v2/care-circle`. Everything here is additive — the v1 flow at `/pay/{token}`
still works.

## What v2 adds

| Requirement | Where |
|---|---|
| Itemised, claimable bill lines (FR-1, FR-2) | `bill_lines`, `app/services/v2/lines.py`, `/care/{token}` |
| Cross-currency quote preview (FR-3) | `app/services/v2/quotes.py`, `POST /v2/public/bills/{token}/quote`, OP server `/quote-preview` |
| Line-aware settlement (FR-4) | `apply_settlement` + `allocate_for_payment`, wired into mock and Open Payments callbacks |
| Live circle feed (FR-5) | `GET /v2/public/bills/{token}/circle`, polled every 5s |
| Shareable receipt (FR-6) | `/receipt/{reference}`, `GET /v2/public/receipts/{reference}` |
| Provider reconciliation + CSV (FR-7) | `/provider/bills/{id}`, `GET /v2/bills/{id}/reconciliation?format=csv` |
| Bill seal / tamper detection (FR-8) | `app/services/v2/verify.py`, `POST/GET /v2/bills/{id}/verify` |
| Telegram, with or without keys | `app/services/v2/notify.py`, `migrations/v2_telegram_env.md` |

## Database

Run, in order, in the Supabase SQL editor:

1. `supabase_migration.sql`
2. `migrations/2026_11_gap_fixes.sql`
3. `migrations/v2_care_circle.sql`

## Run

```bash
# backend
cd brivia-backend
uvicorn main:app --reload --port 8000

# frontend
cd brivia
npm run dev
```

Then:

- **Contributor:** `http://localhost:3000/care/{share_token}`
- **Provider studio:** `http://localhost:3000/provider/bills/{bill_id}`
- **Receipt:** `http://localhost:3000/receipt/{payment_reference}`

To itemise the seeded demo bill, open the provider studio, click **Seal bill**, then
add lines that sum to the bill total and **Save lines**. Lines lock once a
contribution exists, by design.

## Telegram

Nothing is required. With no `TELEGRAM_BOT_TOKEN`:

- subscriptions are stored
- messages are queued in `notification_outbox`
- the API reports `configured: false` and the UI says so

Add `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` / `TELEGRAM_WEBHOOK_SECRET`
(see `migrations/v2_telegram_env.md`) and the same code path delivers live — no
code change. Existing queued messages go out via `POST /v2/notifications/flush`.

## How quotes stay honest

`source: "ilp"` means a real quote from the contributor's wallet. `source:
"indicative"` means the static table in `quotes.py` — the UI labels it
"Indicative rate" and says the wallet shows the final amount. A live quote needs
both the sender wallet and an existing incoming payment; without them we do not
pretend.

## Demo script (4 minutes)

1. Provider studio → seal the bill → show the verified badge.
2. Open `/care/{token}` on a phone-width window: itemised lines, progress per line.
3. Type £20 → show `You send £20.00 / Bill receives ₦42,000` with the fee and net.
4. Claim the lab panel → Pay → receipt card with reference and fee split.
5. Circle strip updates within 5s; provider reconciliation shows the row and
   **CSV** export.
6. Break the seal: change the bill total in the DB, reload `/care/{token}`, show
   the badge flip to "Not sealed / do not pay".

## Known gaps on this branch

- The v1 screens (`/bills/[id]`, `/pay/[token]`) do not yet link to the new
  studio/care routes; add entry points before a real demo.
- `POST /v2/public/bills/{token}/claim` is demo settlement (mock provider). Live
  wallet payments use the v1 Open Payments endpoint with `line_id`.
- Quote previews are indicative unless a wallet and incoming payment exist.
- No automated tests yet.
