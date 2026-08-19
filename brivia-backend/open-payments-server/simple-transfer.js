/**
 * Brivia — Simple Open Payments Transfer
 *
 * Sends funds from sender wallet → receiver wallet.
 * 
 * Usage:
 *   node simple-transfer.js <amount> [description]
 *   node simple-transfer.js 2500 "Healthcare bill contribution"
 *
 * Requires:
 *   - private1.key (your private key)
 *   - .env with OP_WALLET_ADDRESS_URL, SENDER_WALLET_URL
 */

import OpenPayments from "@interledger/open-payments";
import { readFileSync } from "node:fs";

const { createAuthenticatedClient, isFinalizedGrantWithAccessToken, isPendingGrant } = OpenPayments;

// --- Config ---
const PRIVATE_KEY = readFileSync("private1.key", "utf8");
const KEY_ID = "7081bbed-1e3e-416d-b4b5-981b3993be68";

const CLIENT_WALLET = "https://ilp.interledger-test.dev/euroanna";  // your wallet (client identity)
const SENDER_WALLET = "https://ilp.interledger-test.dev/euroanna";  // sender (pays)
const RECEIVER_WALLET = "https://ilp.interledger-test.dev/practice"; // receiver (gets paid)

// --- Parse args ---
const amount = parseInt(process.argv[2] || "1000");
const description = process.argv[3] || "Brivia payment";

console.log(`\n💰 Transferring ${amount} from ${SENDER_WALLET} → ${RECEIVER_WALLET}\n`);

// --- Step 1: Create client ---
const client = await createAuthenticatedClient({
  walletAddressUrl: CLIENT_WALLET,
  keyId: KEY_ID,
  privateKey: PRIVATE_KEY,
});

// --- Step 2: Get wallet addresses ---
const [receiver, sender] = await Promise.all([
  client.walletAddress.get({ url: RECEIVER_WALLET }),
  client.walletAddress.get({ url: SENDER_WALLET }),
]);

console.log(`Receiver: ${receiver.publicName} (${receiver.assetCode})`);
console.log(`Sender:   ${sender.publicName} (${sender.assetCode})\n`);

// --- Step 3: Create incoming payment on receiver ---
const incomingGrant = await client.grant.request(
  { url: receiver.authServer },
  { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read"] }] } },
);

if (!isFinalizedGrantWithAccessToken(incomingGrant)) throw new Error("Incoming grant failed");

const incomingPayment = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: incomingGrant.access_token.value },
  {
    walletAddress: receiver.id,
    incomingAmount: { assetCode: receiver.assetCode, assetScale: receiver.assetScale, value: amount.toString() },
    metadata: { description },
  },
);

console.log(`📥 Incoming payment created: ${incomingPayment.id}\n`);

// --- Step 4: Create outgoing payment grant (interactive) ---
const outgoingGrant = await client.grant.request(
  { url: sender.authServer },
  {
    access_token: {
      access: [{
        type: "outgoing-payment",
        actions: ["create"],
        limits: { debitAmount: { assetCode: sender.assetCode, assetScale: sender.assetScale, value: amount.toString() } },
        identifier: sender.id,
      }],
    },
    interact: { start: ["redirect"] },
  },
);

if (!isPendingGrant(outgoingGrant)) throw new Error("Expected pending outgoing grant");

console.log(`🔗 Open this URL to approve the payment:\n   ${outgoingGrant.interact.redirect}\n`);
console.log("Waiting for approval... (press Ctrl+C if browser doesn't open)\n");

// --- Step 5: Wait for user to approve, then finalize ---
// Poll the continue URI until grant is finalized
let finalizedGrant = null;
for (let i = 0; i < 120; i++) {  // 2 minutes max
  await new Promise(r => setTimeout(r, 1000));
  try {
    const result = await client.grant.continue({
      url: outgoingGrant.continue.uri,
      accessToken: outgoingGrant.continue.access_token.value,
    });
    if (isFinalizedGrantWithAccessToken(result)) {
      finalizedGrant = result;
      break;
    }
  } catch {
    // Grant not ready yet, keep polling
  }
}

if (!finalizedGrant) {
  console.log("❌ Grant not approved within 2 minutes.");
  process.exit(1);
}

console.log("✅ Grant approved!\n");

// --- Step 6: Execute outgoing payment ---
const outgoingPayment = await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken: finalizedGrant.access_token.value },
  {
    walletAddress: sender.id,
    incomingPayment: incomingPayment.id,
    debitAmount: { assetCode: sender.assetCode, assetScale: sender.assetScale, value: amount.toString() },
    metadata: { description },
  },
);

console.log(`📤 Outgoing payment created: ${outgoingPayment.id}`);
console.log(`   Debit:  ${outgoingPayment.debitAmount.value} ${outgoingPayment.debitAmount.assetCode}`);
console.log(`   Receive: ${outgoingPayment.receiveAmount.value} ${outgoingPayment.receiveAmount.assetCode}\n`);

// --- Step 7: Poll for settlement ---
console.log("⏳ Waiting for settlement...\n");

for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000));
  try {
    const updated = await client.incomingPayment.get({
      url: incomingPayment.id,
      accessToken: incomingGrant.access_token.value,
    });
    const received = updated.receivedAmount?.value || "0";
    process.stdout.write(`   Attempt ${i + 1}: received ${received} ${receiver.assetCode}\r`);

    if (updated.completed || parseInt(received) > 0) {
      console.log(`\n\n✅ Payment settled!`);
      console.log(`   Received: ${received} ${receiver.assetCode}`);
      console.log(`   Completed: ${updated.completed}`);
      process.exit(0);
    }
  } catch (e) {
    // keep polling
  }
}

console.log("\n⚠️  Settlement not confirmed within timeout. Check the receiver wallet manually.");
process.exit(1);
