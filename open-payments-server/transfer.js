/**
 * =============================================================================
 * BRIVIA — Open Payments Transfer (Fully Annotated)
 * =============================================================================
 *
 * WHAT THIS FILE DOES:
 *   This script sends real money (testnet EUR) from one Interledger wallet
 *   to another using the Open Payments protocol. It is the core payment
 *   engine that powers Brivia's healthcare bill contribution system.
 *
 * THE FLOW (6 STEPS):
 *   1. Create an authenticated client (proves who you are)
 *   2. Create an incoming payment on the RECEIVER's wallet (they agree to receive)
 *   3. Get a quote from the SENDER's wallet (how much will it cost?)
 *   4. Request an outgoing payment grant (sender approves the spend)
 *   5. Execute the outgoing payment (money moves)
 *   6. Poll until the receiver gets the funds (settlement)
 *
 * THREE ROLES:
 *   CLIENT  — The wallet that authenticates with the SDK (your identity)
 *   SENDER  — The wallet that pays (money leaves this wallet)
 *   RECEIVER — The wallet that gets paid (money arrives here)
 *
 * USAGE:
 *   node transfer.js <amount> [description]
 *   node transfer.js 100 "Healthcare bill contribution"
 *
 * REQUIREMENTS:
 *   - private1.key (your wallet's private key, downloaded from Rafiki dashboard)
 *   - npm install @interledger/open-payments
 *
 * =============================================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: IMPORTS & SETUP
// ─────────────────────────────────────────────────────────────────────────────
// We import the Open Payments SDK. It's a CommonJS module, so we use
// the default import pattern and destructure what we need.
//
// WHY CommonJS? The @interledger/open-payments package doesn't export
// named ESM exports. Using `import pkg from "..."` then destructuring
// avoids the "Named export not found" error.

import pkg from "@interledger/open-payments";
import { readFileSync } from "node:fs";

// Destructure only the functions we actually use from the SDK:
//   createAuthenticatedClient — creates an SDK client tied to your wallet
const { createAuthenticatedClient } = pkg;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: TLS CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
// The Interledger testnet uses self-signed TLS certificates.
// Node.js (unlike curl -k) rejects self-signed certs by default.
// Setting this env var disables certificate verification so our
// requests to auth.interledger-test.dev don't fail with "fetch failed".
//
// WARNING: Only do this for TESTNET. In production, always verify certs.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: WALLET CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
// These are your three wallet addresses on the Interledger testnet.
//
// WHERE TO FIND THEM:
//   - Go to https://rafiki.money/dashboard
//   - Each wallet you create has a public URL like:
//     https://ilp.interledger-test.dev/<wallet-name>
//
// KEY_ID and PRIVATE_KEY:
//   - Created in the Rafiki dashboard under "API Keys"
//   - The private key is downloaded once and stored as private1.key
//   - The key_id identifies which key you're using
//   - The key must be registered to the CLIENT wallet (not sender/receiver)

const PRIVATE_KEY = readFileSync("private1.key", "utf8");  // Your wallet's private key file
const KEY_ID = "7081bbed-1e3e-416d-b4b5-981b3993be68";    // Your API key ID

// CLIENT = The wallet whose identity the SDK uses to authenticate.
//          The PRIVATE_KEY must belong to this wallet.
//          The SDK uses this wallet's auth server to get access tokens.
//
// SENDER = The wallet that pays. Money will be debited from here.
//          The user must approve the outgoing payment via browser redirect.
//
// RECEIVER = The wallet that receives payment. An incoming payment is
//            created on this wallet to accept the funds.

const CLIENT_WALLET   = "https://ilp.interledger-test.dev/practice";
const SENDER_WALLET   = "https://ilp.interledger-test.dev/euroanna";
const RECEIVER_WALLET = "https://ilp.interledger-test.dev/41fe8576";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: CLI ARGUMENTS
// ─────────────────────────────────────────────────────────────────────────────
// Parse command-line arguments: amount and optional description.
//
// EXAMPLES:
//   node transfer.js 100
//   node transfer.js 250 "Hospital bill for surgery"

const rawAmount = process.argv[2] || "100";        // Amount in EUR (human-readable)
const description = process.argv[3] || "Brivia payment";  // Payment description

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: CREATE AUTHENTICATED CLIENT
// ─────────────────────────────────────────────────────────────────────────────
// This is the MOST IMPORTANT step. It creates an SDK client that:
//   1. Downloads the wallet's OpenAPI spec (auto-discovery)
//   2. Registers your private key with the auth server
//   3. Can make authenticated requests on behalf of CLIENT_WALLET
//
// WHAT HAPPENS UNDER THE HOOD:
//   - SDK fetches https://ilp.interledger-test.dev/practice (the wallet)
//   - From the wallet, it gets the authServer URL
//   - It fetches the OpenAPI spec from the auth server
//   - It registers your key as a "client" with that auth server
//   - Now any request it makes is signed with your key
//
// validateResponses: false
//   - Disables response validation against the OpenAPI spec
//   - Useful when the testnet returns unexpected response shapes

const client = await createAuthenticatedClient({
  walletAddressUrl: CLIENT_WALLET,  // Which wallet am I?
  keyId: KEY_ID,                     // Which API key?
  privateKey: PRIVATE_KEY,           // The actual private key content
  validateResponses: false,          // Skip OpenAPI response validation
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: RESOLVE WALLET ADDRESSES
// ─────────────────────────────────────────────────────────────────────────────
// Each wallet URL is an "Open Payments wallet address" — a JSON document
// that contains metadata about the wallet:
//
// {
//   id: "https://ilp.interledger-test.dev/euroanna",
//   publicName: "ANNA EURO",
//   assetCode: "EUR",          ← What currency this wallet uses
//   assetScale: 2,             ← Decimal places (2 = cents, so 100 = 1.00 EUR)
//   authServer: "https://auth.interledger-test.dev/...",
//   resourceServer: "https://ilp.interledger-test.dev/..."
// }
//
// We need the full wallet objects to get:
//   - authServer URL (for requesting grants)
//   - resourceServer URL (for creating payments)
//   - assetCode and assetScale (for amount formatting)

const receiver = await client.walletAddress.get({ url: RECEIVER_WALLET });
const sender   = await client.walletAddress.get({ url: SENDER_WALLET });

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: AMOUNT SCALING
// ─────────────────────────────────────────────────────────────────────────────
// Open Payments uses "base units" (like cents), not decimal amounts.
//
// EXAMPLE:
//   assetScale = 2 (EUR has 2 decimal places)
//   User says: "100 EUR"
//   In base units: 100 * 10^2 = 10000 (i.e., 10000 cents)
//
// This is critical! If you send "100" with assetScale=2,
// you're actually sending 1.00 EUR, not 100 EUR.

const amountInBaseUnits = (
  parseFloat(rawAmount) * Math.pow(10, sender.assetScale)
).toString();

console.log(
  `Transferring ${rawAmount} EUR (${amountInBaseUnits} base units)...`
);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: CREATE INCOMING PAYMENT (on receiver's wallet)
// ─────────────────────────────────────────────────────────────────────────────
// An "incoming payment" is like a bank account saying:
//   "I'm expecting to receive money. Here's my reference."
//
// Before we can create one, we need a GRANT from the receiver's auth server.
// A grant is an access token that says "you have permission to do X".
//
// GRANT REQUEST:
//   We ask the receiver's auth server for permission to:
//     - "create" incoming payments (make a new payment slot)
//     - "read" incoming payments (check if money arrived)
//     - "complete" incoming payments (force-close the payment)
//
// The auth server responds with an access token we use for subsequent API calls.

const incGrant = await client.grant.request(
  // URL of the auth server (we got this from the wallet address)
  { url: receiver.authServer },

  // What permissions we're requesting
  {
    access_token: {
      access: [
        {
          type: "incoming-payment",     // What type of resource
          actions: ["create", "read", "complete"],  // What we want to do
        },
      ],
    },
  }
);

// Now create the actual incoming payment on the receiver's resource server.
// NOTE: We do NOT set incomingAmount here. Why?
//   - The ILP connector charges ~4% fees
//   - If we request 100 EUR but only 96 EUR arrives (after fees),
//     the payment stays "incomplete" forever
//   - By NOT setting incomingAmount, the payment completes
//     as soon as ANY money arrives
//
// The incomingPayment object returned looks like:
//   {
//     id: "https://.../incoming-payments/abc123",
//     walletAddress: "https://ilp.interledger-test.dev/41fe8576",
//     receivedAmount: { value: "0", assetCode: "EUR", assetScale: 2 },
//     completed: false,
//     ...
//   }

const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: incGrant.access_token.value },
  {
    walletAddress: receiver.id,     // Which wallet receives?
    metadata: { description },      // What's it for?
    // No incomingAmount — completes on any receipt
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: GET A QUOTE (from sender's wallet)
// ─────────────────────────────────────────────────────────────────────────────
// A quote answers: "If I send X amount, how much will the receiver get?"
//
// WHY QUOTES MATTER:
//   - ILP connectors charge fees (typically 2-4%)
//   - The quote tells you EXACTLY what will be debited and received
//   - You need a quote ID to create the outgoing payment
//   - Without a quote, you'd get "negative receive amount" errors
//
// We need a SEPARATE grant for quotes (different permission scope).

const quoteGrant = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [{ type: "quote", actions: ["create", "read"] }],
    },
  }
);

// Create the quote. This contacts the sender's connector which:
//   1. Checks if sender → receiver route exists
//   2. Calculates fees
//   3. Returns exact debit/receive amounts
//
// Quote result example:
//   {
//     debitAmount:  { value: "10400", assetCode: "EUR", assetScale: 2 },
//     receiveAmount: { value: "10000", assetCode: "EUR", assetScale: 2 },
//     method: "ilp"
//   }
//   (Sender pays 104.00 EUR, receiver gets 100.00 EUR, 4 EUR fee)

const quote = await client.quote.create(
  { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
  {
    walletAddress: sender.id,     // Who's paying?
    receiver: incomingPayment.id, // Where's it going? (the incoming payment URL)
    debitAmount: {                // How much to send?
      value: amountInBaseUnits,
      assetCode: sender.assetCode,
      assetScale: sender.assetScale,
    },
    method: "ilp",                // Payment method (Interledger Protocol)
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: REQUEST OUTGOING PAYMENT GRANT (interactive approval)
// ─────────────────────────────────────────────────────────────────────────────
// This is the "authorization" step — like entering your PIN at an ATM.
//
// The sender's auth server requires the wallet owner to APPROVE the payment.
// This is done via browser redirect:
//   1. We request a grant with interact.start: ["redirect"]
//   2. Auth server gives us a redirect URL
//   3. User opens that URL in a browser
//   4. User approves/rejects the payment
//   5. Auth server redirects back with a confirmation
//   6. We poll the "continue" URL until the grant is finalized
//
// The limit (quote.debitAmount) ensures the grant can't be used for
// more than the quoted amount — prevents overspending.

const outGrant = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [
        {
          type: "outgoing-payment",
          actions: ["create"],           // Permission to create outgoing payments
          limits: { debitAmount: quote.debitAmount },  // Max spend = quote amount
          identifier: sender.id,         // Which wallet this applies to
        },
      ],
    },
    interact: { start: ["redirect"] },   // Require browser-based approval
  }
);

// Show the approval URL to the user
if (outGrant.interact?.redirect) {
  console.log(`Approve payment here: ${outGrant.interact.redirect}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: WAIT FOR APPROVAL & FINALIZE GRANT
// ─────────────────────────────────────────────────────────────────────────────
// After the user approves in the browser, we need to "continue" the grant.
//
// HOW IT WORKS:
//   1. User approves → auth server sets a flag internally
//   2. We poll the "continue" URI every second
//   3. Auth server returns the finalized grant (with access token)
//   4. We use that access token to create the outgoing payment
//
// If the grant was already approved (e.g., cached), it's finalized immediately.
// We check by looking for `access_token` in the response.

let finalizedGrant = null;

if (outGrant.interact?.redirect) {
  // Interactive flow — wait for user to approve in browser
  // Poll every 1 second for up to 2 minutes (120 attempts)
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));  // Wait 1 second

    try {
      const res = await client.grant.continue({
        url: outGrant.continue.uri,                    // The "continue" endpoint
        accessToken: outGrant.continue.access_token.value,  // Continuation token
      });

      // If we get back an access_token, the grant is finalized
      if (res.access_token) {
        finalizedGrant = res;
        break;
      }
    } catch {
      // Grant not ready yet — user hasn't approved yet
      // This is normal, keep polling
    }
  }
} else {
  // Non-interactive flow — grant was immediately finalized
  // (can happen if you recently approved a similar grant)
  finalizedGrant = outGrant;
}

// Safety check — if we never got a finalized grant, abort
if (!finalizedGrant || !finalizedGrant.access_token) {
  console.log("Timed out waiting for approval.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: EXECUTE OUTGOING PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
// Now we create the actual outgoing payment. This is where money moves.
//
// WHAT HAPPENS:
//   1. SDK sends POST to sender's resource server
//   2. Resource server validates the quote ID and access token
//   3. The ILP connector initiates the payment
//   4. Money flows: sender → connector → receiver
//   5. The outgoingPayment object is returned immediately
//      (settlement may still be in progress)
//
// The outgoingPayment contains:
//   - id: URL of this payment (for future reference)
//   - debitAmount: what was taken from sender
//   - receiveAmount: what will arrive at receiver (from the quote)
//   - sentAmount: how much has been sent so far (may be 0 initially)
//   - failed: whether the payment failed

const outgoingPayment = await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken: finalizedGrant.access_token.value },
  {
    walletAddress: sender.id,   // Which wallet is paying?
    quoteId: quote.id,          // Reference the quote we got earlier
    metadata: { description },  // Payment description
  }
);

console.log(`Outgoing Payment Created: ${outgoingPayment.id}`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6: POLL FOR SETTLEMENT
// ─────────────────────────────────────────────────────────────────────────────
// ILP payments are asynchronous — the money doesn't arrive instantly.
// We poll the incoming payment to check if funds have arrived.
//
// SETTLEMENT PROCESS:
//   1. Sender's connector creates ILP packets with the money
//   2. Packets hop through the ILP network (connector to connector)
//   3. Receiver's connector accepts the packets
//   4. Each accepted packet adds to receivedAmount
//   5. Once receivedAmount > 0, we force-complete the payment
//
// We poll every 2 seconds for up to 40 seconds (20 attempts).
// On testnet, settlement usually takes 2-10 seconds.

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 2000));  // Wait 2 seconds

  // Check the incoming payment status
  const updated = await client.incomingPayment.get({
    url: incomingPayment.id,
    accessToken: incGrant.access_token.value,
  });

  const received = updated.receivedAmount?.value || "0";

  // Log progress
  console.log(
    `Poll ${i + 1}: Received ${received} base units`
  );

  if (parseInt(received) > 0) {
    // Money arrived! Force the incoming payment to complete state.
    // Without this, the payment might stay "open" waiting for more.
    await client.incomingPayment.complete({
      url: incomingPayment.id,
      accessToken: incGrant.access_token.value,
    });

    // Convert back to human-readable amount
    const humanAmount = parseInt(received) / Math.pow(10, receiver.assetScale);
    console.log(
      `\nSuccess! Received: ${humanAmount} ${receiver.assetCode}`
    );
    process.exit(0);
  }
}

// If we get here, settlement didn't happen within the timeout
console.log("\nSettlement not confirmed within timeout.");
console.log("Check the receiver wallet manually.");
process.exit(1);
