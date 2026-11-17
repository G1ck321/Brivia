# Telegram wiring (optional)

Brivia v2 never requires Telegram credentials. With none set:

- subscriptions are stored in `telegram_subscriptions`
- every notification is written to `notification_outbox` with status `queued`
- the API reports `telegram.configured = false` and the UI says updates are queued
- `POST /v2/notifications/flush` reports the backlog without pretending to send

## Enabling it later

Add to `brivia-backend/.env` (or the Render environment):

```ini
TELEGRAM_BOT_TOKEN=123456:ABC...      # from @BotFather
TELEGRAM_BOT_USERNAME=brivia_bot      # optional, used for the deep link
TELEGRAM_WEBHOOK_SECRET=some-random   # optional but recommended
```

Then either let contributors follow bills from the care page, or register the
webhook so `/start BRV-XXXXXXXX` works:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://your-api.example.com/v2/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Queued messages are delivered by:

```bash
curl -X POST https://your-api.example.com/v2/notifications/flush \
  -H "Authorization: Bearer <provider JWT>"
```

No code change is needed to go from keyless to live.
