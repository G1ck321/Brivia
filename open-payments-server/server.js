/**
 * Brivia Open Payments Server
 * 
 * HTTP API that wraps the Open Payments flow.
 * FastAPI calls this via httpx to handle real ILP payments.
 * 
 * Endpoints:
 *   POST /setup-incoming    - Create incoming payment on receiver wallet
 *   POST /initiate-outgoing - Request outgoing payment grant (returns redirect URL)
 *   POST /finalize-payment  - After user approves, finalize and execute payment
 *   POST /poll-settlement   - Poll incoming payment for settlement
 *   GET  /health           - Health check
 * 
 * Start: node server.js
 */

import http from "node:http";
import OpenPayments from "@interledger/open-payments";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Testnet uses self-signed TLS — must disable verification
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { createAuthenticatedClient, isFinalizedGrant, isPendingGrant } = OpenPayments;

// --- Config (override via env vars) ---
const PORT = process.env.PORT || process.env.OP_SERVER_PORT || 3100;
const KEY_ID = process.env.OP_KEY_ID || "7081bbed-1e3e-416d-b4b5-981b3993be68";

// Private key: support env var (Render) or file (local dev)
function getPrivateKey() {
  // Option 1: OP_PRIVATE_KEY env var (for Render / cloud deploy)
  if (process.env.OP_PRIVATE_KEY) {
    console.log("Using private key from OP_PRIVATE_KEY env var");
    return process.env.OP_PRIVATE_KEY;
  }
  // Option 2: Local file (for local dev)
  const keyPath = process.env.OP_PRIVATE_KEY_PATH || "private1.key";
  if (existsSync(keyPath)) {
    console.log(`Using private key from file: ${keyPath}`);
    return readFileSync(keyPath, "utf8");
  }
  throw new Error(
    "No private key found. Set OP_PRIVATE_KEY env var or provide a private1.key file."
  );
}

// Store grants in memory (use Redis/DB in production)
const grantStore = new Map();

// --- Create client ---
let client = null;

async function getClient() {
  if (client) return client;
  const privateKey = getPrivateKey();
  client = await createAuthenticatedClient({
    walletAddressUrl: process.env.OP_WALLET_ADDRESS_URL || "https://ilp.interledger-test.dev/practice",
    keyId: KEY_ID,
    privateKey,
    validateResponses: false,
  });
  return client;
}

// --- Request handler ---
async function handleRequest(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://0.0.0.0:${PORT}`);

  try {
    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "brivia-open-payments" }));
      return;
    }

    // All other routes are POST
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Read request body
    const body = await readBody(req);

    // --- POST /setup-incoming ---
    if (url.pathname === "/setup-incoming") {
      const { receiver_wallet_url, amount_minor, reference } = body;
      const result = await setupIncomingPayment(receiver_wallet_url, amount_minor, reference);
      respond(res, 200, result);
      return;
    }

    // --- POST /initiate-outgoing ---
    if (url.pathname === "/initiate-outgoing") {
      const { sender_wallet_url, incoming_payment_url, amount_minor } = body;
      const result = await initiateOutgoingPayment(sender_wallet_url, incoming_payment_url, amount_minor);
      respond(res, 200, result);
      return;
    }

    // --- POST /finalize-payment ---
    if (url.pathname === "/finalize-payment") {
      const { continue_uri, continue_token, sender_wallet_url, incoming_payment_id, amount_minor, description } = body;
      const result = await finalizeAndPay(continue_uri, continue_token, sender_wallet_url, incoming_payment_id, amount_minor, description);
      respond(res, 200, result);
      return;
    }

    // --- POST /poll-settlement ---
    if (url.pathname === "/poll-settlement") {
      const { incoming_payment_url, max_attempts, interval_ms } = body;
      const result = await pollSettlement(incoming_payment_url, max_attempts, interval_ms);
      respond(res, 200, result);
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));

  } catch (err) {
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    if (err.body) console.error("Body:", JSON.stringify(err.body));
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message, detail: err.body || null }));
  }
}

// --- Payment flow functions ---

async function setupIncomingPayment(receiverWalletUrl, amountMinor, reference) {
  const c = await getClient();
  console.log(`[setup-incoming] receiver=${receiverWalletUrl} amount=${amountMinor}`);

  // Get wallet address
  const wallet = await c.walletAddress.get({ url: receiverWalletUrl });
  console.log(`[setup-incoming] wallet OK authServer=${wallet.authServer}`);

  // Request incoming payment grant
  const grant = await c.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [{ type: "incoming-payment", actions: ["create", "read"] }],
      },
    },
  );
  console.log(`[setup-incoming] grant OK finalized=${isFinalizedGrant(grant)}`);

  if (!isFinalizedGrant(grant)) {
    throw new Error("Failed to get incoming payment grant");
  }

  // Create incoming payment — no incomingAmount to avoid fee issues
  const incomingPayment = await c.incomingPayment.create(
    {
      url: wallet.resourceServer,
      accessToken: grant.access_token.value,
    },
    {
      walletAddress: wallet.id,
      metadata: { description: `Brivia bill - ${reference}` },
    },
  );
  console.log(`[setup-incoming] incomingPayment OK id=${incomingPayment.id}`);

  return {
    incoming_payment_id: incomingPayment.id,
    wallet_address: wallet.id,
    asset_code: wallet.assetCode,
    asset_scale: wallet.assetScale,
    received_amount: incomingPayment.receivedAmount,
    completed: incomingPayment.completed,
    access_token: grant.access_token.value,
  };
}

async function initiateOutgoingPayment(senderWalletUrl, incomingPaymentUrl, amountMinor) {
  const c = await getClient();

  const wallet = await c.walletAddress.get({ url: senderWalletUrl });
  console.log(`[initiate-outgoing] sender=${senderWalletUrl} incoming=${incomingPaymentUrl} amount=${amountMinor}`);

  // Step 1: Get a quote from sender (matches transfer.js Step 2)
  const quoteGrant = await c.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [{ type: "quote", actions: ["create", "read"] }],
      },
    },
  );

  if (!isFinalizedGrant(quoteGrant)) {
    throw new Error("Failed to get quote grant");
  }

  const quote = await c.quote.create(
    { url: wallet.resourceServer, accessToken: quoteGrant.access_token.value },
    {
      walletAddress: wallet.id,
      receiver: incomingPaymentUrl,
      debitAmount: {
        value: amountMinor.toString(),
        assetCode: wallet.assetCode,
        assetScale: wallet.assetScale,
      },
      method: "ilp",
    },
  );

  console.log(`[initiate-outgoing] quote OK debit=${quote.debitAmount.value} receive=${quote.receiveAmount.value}`);

  // Step 2: Request outgoing payment grant with quote.debitAmount as limit
  const grant = await c.grant.request(
    { url: wallet.authServer },
    {
      access_token: {
        access: [
          {
            type: "outgoing-payment",
            actions: ["create"],
            limits: { debitAmount: quote.debitAmount },
            identifier: wallet.id,
          },
        ],
      },
      interact: { start: ["redirect"] },
    },
  );

  if (!isPendingGrant(grant)) {
    throw new Error("Expected pending grant for outgoing payment");
  }

  console.log(`[initiate-outgoing] grant OK redirect=${grant.interact.redirect}`);

  return {
    interact_redirect: grant.interact.redirect,
    continue_uri: grant.continue.uri,
    continue_token: grant.continue.access_token.value,
    quote_id: quote.id,
  };
}

async function finalizeAndPay(continueUri, continueToken, senderWalletUrl, incomingPaymentUrl, amountMinor, description) {
  const c = await getClient();
  console.log(`[finalize] incoming=${incomingPaymentUrl} amount=${amountMinor}`);

  // Finalize grant after user approval
  const grant = await c.grant.continue({
    url: continueUri,
    accessToken: continueToken,
  });

  if (!isFinalizedGrant(grant)) {
    throw new Error("Grant not finalized");
  }
  console.log(`[finalize] grant finalized OK`);

  const wallet = await c.walletAddress.get({ url: senderWalletUrl });

  // Execute outgoing payment using incomingPayment + debitAmount
  // (matches test-transfer.js which works correctly on testnet)
  const payment = await c.outgoingPayment.create(
    {
      url: wallet.resourceServer,
      accessToken: grant.access_token.value,
    },
    {
      walletAddress: wallet.id,
      incomingPayment: incomingPaymentUrl,
      debitAmount: {
        assetCode: wallet.assetCode,
        assetScale: wallet.assetScale,
        value: amountMinor.toString(),
      },
      metadata: { description: description || "Brivia bill contribution" },
    },
  );

  console.log(`[finalize] outgoing payment OK id=${payment.id}`);
  console.log(`[finalize] debit=${payment.debitAmount?.value} receive=${payment.receiveAmount?.value}`);

  return {
    payment_id: payment.id,
    receive_amount: payment.receiveAmount,
    debit_amount: payment.debitAmount,
    sent_amount: payment.sentAmount,
    completed: payment.completed,
    failed: payment.failed,
  };
}

async function pollSettlement(incomingPaymentUrl, maxAttempts = 30, intervalMs = 2000) {
  const c = await getClient();

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // We need to read the incoming payment
      // This requires an access token - in production, store it
      // For now, we'll return the current state
      const wallet = await c.walletAddress.get({
        url: process.env.OP_RECEIVING_WALLET_URL || "https://ilp.interledger-test.dev/practice",
      });

      const grant = await c.grant.request(
        { url: wallet.authServer },
        {
          access_token: {
            access: [{ type: "incoming-payment", actions: ["read"] }],
          },
        },
      );

      if (isFinalizedGrant(grant)) {
        const payment = await c.incomingPayment.get({
          url: incomingPaymentUrl,
          accessToken: grant.access_token.value,
        });

        const received = parseInt(payment.receivedAmount?.value || "0");

        if (payment.completed || received > 0) {
          return {
            status: "completed",
            received_amount: payment.receivedAmount,
            completed: payment.completed,
          };
        }
      }
    } catch (err) {
      console.error(`Poll attempt ${i + 1} failed:`, err.message);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return {
    status: "timeout",
    received_amount: { value: "0" },
    completed: false,
  };
}

// --- Helpers ---

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function respond(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// --- Start server ---
const server = http.createServer(handleRequest);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Brivia Open Payments server running on port ${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});
