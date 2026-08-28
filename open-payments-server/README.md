# Brivia Open Payments Server

## Quick Start

```bash
cd open-payments-server
npm install
npm run dev
```

Server runs on `http://localhost:3100`

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server with auto-reload (nodemon) |
| `npm start` | Start production server |
| `npm run transfer` | Run single transfer script |

## Testing a Transfer

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node transfer.js 100 "Healthcare bill"
```

1. Open the approval URL in browser
2. Approve the payment
3. Watch settlement complete

## Environment

- `private1.key` — Your wallet's private key (from Rafiki dashboard)
- `KEY_ID` — Your API key ID (in transfer.js)

## Troubleshooting

| Error | Fix |
|-------|-----|
| `fetch failed` | Set `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `invalid_client` | Check CLIENT_WALLET matches key registration |
| `negative receive amount` | Add quote step (already in transfer.js) |
