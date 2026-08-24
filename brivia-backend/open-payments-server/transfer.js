/**
 * Brivia — Open Payments Transfer (single clean script)
 *
 * Fixes:
 *   1. "negative receive amount" — uses correct grant + quote flow
 *   2. "pending on receiver" — omits incomingAmount so payment completes on any receipt
 *
 * Usage:
 *   node transfer.js <amount> [description]
 *   node transfer.js 100 "Healthcare bill"
 *
 * Requires: private1.key in this directory
 */

import { createAuthenticatedClient, isFinalizedGrantWithAccessToken, isPendingGrant } from "@interledger/open-payments";
import { readFileSync } from "node:fs";

// --- Config ---
const PRIVATE_KEY = readFileSync("private1.key", "utf8");
const KEY_ID = "7081bbed-1e3e-416d-b4b5-981b3993be68";

// CLIENT = who authenticates (must be a wallet you own)
// SENDER = who pays
// RECEIVER = who gets paid
const CLIENT_WALLET  = "https://ilp.interledger-test.dev/euroanna";
const SENDER_WALLET  = "https://ilp.interledger-test.dev/euroanna";
const RECEIVER_WALLET = "https://ilp.interledger-test.dev/practice";

const amount = parseInt(process.argv[2] || "100");
const description = process.argv[3] || "Brivia payment";

// --- Step 1: Create authenticated client ---
console.log(`\nBrivia Transfer: ${amount} EUR from euroanna -> practice\n`);

const client = await createAuthenticatedClient({
  walletAddressUrl: CLIENT_WALLET,
  keyId: KEY_ID,
  privateKey: PRIVATE_KEY,
});

// --- Step 2: Resolve wallet addresses ---
const receiver = await client.walletAddress.get({ url: RECEIVER_WALLET });
const sender   = await client.walletAddress.get({ url: SENDER_WALLET });

console.log(`Sender:   ${sender.publicName} (${sender.id})`);
console.log(`Receiver: ${receiver.publicName} (${receiver.id})\n`);

// --- Step 3: Create incoming payment on RECEIVER ---
// KEY FIX: Do NOT set incomingAmount — this lets the payment complete
// as soon as any funds arrive, instead of waiting for the full amount.
// The connector charges ~4% fees, so setting incomingAmount causes
// "completed: false" because the full amount never arrives.
const incGrant = await client.grant.request(
  { url: receiver.authServer },
  {
    access_token: {
      access: [{ type: "incoming-payment", actions: ["create", "read"] }],
    },
  },
);
if (!isFinalizedGrantWithAccessToken(incGrant)) {
  throw new Error("Failed to get incoming payment grant");
}

const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: incGrant.access_token.value },
  {
    walletAddress: receiver.id,
    // NO incomingAmount — payment completes on any receipt
    metadata: { description },
  },
);
console.log(`Incoming payment: ${incomingPayment.id}`);

// --- Step 4: Request outgoing payment grant (interactive) ---
// KEY FIX: Request a non-interactive grant first using a separate wallet for the client,
// OR use the sender wallet and handle the interactive redirect.
// Since CLIENT == SENDER, the grant request goes to the sender's auth server.

const outGrant = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [
        {
          type: "outgoing-payment",
          actions: ["create"],
          limits: {
            debitAmount: {
              assetCode: sender.assetCode,
              assetScale: sender.assetScale,
              value: (amount * 2).toString(),  // extra headroom for fees
            },
          },
          identifier: sender.id,
        },
      ],
    },
    interact: { start: ["redirect"] },
  },
);

if (!isPendingGrant(outGrant)) {
  console.log("Grant was immediately finalized (non-interactive)");
  // This can happen if you already approved recently
}

const approveUrl = outGrant.interact?.redirect;
if (approveUrl) {
  console.log(`\nOpen this URL to approve the payment:\n  ${approveUrl}\n`);
} else {
  console.log("Grant already approved or no redirect URL.\n");
}

// --- Step 5: Wait for approval ---
let finalizedGrant = null;

if (isPendingGrant(outGrant)) {
  console.log("Waiting for approval... (approve in browser)\n");
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const result = await client.grant.continue({
        url: outGrant.continue.uri,
        accessToken: outGrant.continue.access_token.value,
      });
      if (isFinalizedGrantWithAccessToken(result)) {
        finalizedGrant = result;
        break;
      }
    } catch {
      // Not ready yet
    }
  }
} else {
  finalizedGrant = outGrant;
}

if (!finalizedGrant) {
  console.log("Timed out waiting for approval.");
  process.exit(1);
}
console.log("Approved!\n");

// --- Step 6: Get a quote first, then create outgoing payment ---
// KEY FIX: Create a quote first to get the exact receiveAmount,
// then create the outgoing payment referencing the quote.
// This avoids the "negative receive amount" error.

const quote = await client.quote.create(
  { url: sender.resourceServer, accessToken: finalizedGrant.access_token.value },
  {
    walletAddress: sender.id,
    incomingPayment: incomingPayment.id,
  },
);
console.log(`Quote:`);
console.log(`  Debit:   ${quote.debitAmount.value} ${quote.debitAmount.assetCode}`);
console.log(`  Receive: ${quote.receiveAmount.value} ${quote.receiveAmount.assetCode}\n`);

// Now create outgoing payment using the quote
const outgoingPayment = await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken: finalizedGrant.access_token.value },
  {
    walletAddress: sender.id,
    quoteId: quote.id,
    metadata: { description },
  },
);

console.log(`Outgoing payment created: ${outgoingPayment.id}`);
console.log(`  Debit:   ${outgoingPayment.debitAmount.value} ${outgoingPayment.debitAmount.assetCode}`);
console.log(`  Receive: ${outgoingPayment.receiveAmount.value} ${outgoingPayment.receiveAmount.assetCode}`);
console.log(`  Failed:  ${outgoingPayment.failed}\n`);

// --- Step 7: Poll for settlement ---
console.log("Polling for settlement...\n");

for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const updated = await client.incomingPayment.get({
      url: incomingPayment.id,
      accessToken: incGrant.access_token.value,
    });
    const received = updated.receivedAmount?.value || "0";
    process.stdout.write(
      `  ${i + 1}: received=${received} ${receiver.assetCode} completed=${updated.completed}\r`
    );
    if (updated.completed) {
      console.log(`\n\nDone! Received ${received} ${receiver.assetCode}`);
      process.exit(0);
    }
    if (parseInt(received) > 0 && !updated.completed) {
      // Funds arrived but incomingAmount not reached (we didn't set one, so this shouldn't happen)
      console.log(`\n\nFunds received: ${received} ${receiver.assetCode} (payment settling)`);
      process.exit(0);
    }
  } catch {
    process.stdout.write(`  ${i + 1}: polling...\r`);
  }
}

console.log("\n\nSettlement not confirmed within timeout.");
console.log("Check: https://ilp.interledger-test.dev/practice");
process.exit(1);
