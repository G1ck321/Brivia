/**
 * Brivia test: euroanna → practice (different wallets, same currency EUR)
 * 
 * Usage: node test-transfer.js [amount]
 */

import OpenPayments from "@interledger/open-payments";
import { readFileSync } from "node:fs";

const { createAuthenticatedClient, isFinalizedGrantWithAccessToken, isPendingGrant } = OpenPayments;

const PRIVATE_KEY = readFileSync("private1.key", "utf8");
const KEY_ID = "7081bbed-1e3e-416d-b4b5-981b3993be68";

// Client authenticates as sender
const CLIENT_WALLET = "https://ilp.interledger-test.dev/euroanna";
// Sender pays
const SENDER_WALLET = "https://ilp.interledger-test.dev/euroanna";
// Receiver gets paid
const RECEIVER_WALLET = "https://ilp.interledger-test.dev/practice";

const amount = parseInt(process.argv[2] || "100");

console.log(`\n🧪 Test: ${amount} EUR from euroanna → practice\n`);

const client = await createAuthenticatedClient({
  walletAddressUrl: CLIENT_WALLET,
  keyId: KEY_ID,
  privateKey: PRIVATE_KEY,
});

const [receiver, sender] = await Promise.all([
  client.walletAddress.get({ url: RECEIVER_WALLET }),
  client.walletAddress.get({ url: SENDER_WALLET }),
]);

console.log(`Sender:   ${sender.publicName} (${sender.assetCode})`);
console.log(`Receiver: ${receiver.publicName} (${receiver.assetCode})\n`);

// 1. Create incoming payment on receiver
const incGrant = await client.grant.request(
  { url: receiver.authServer },
  { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read"] }] } },
);
if (!isFinalizedGrantWithAccessToken(incGrant)) throw new Error("inc grant failed");

const incoming = await client.incomingPayment.create(
  { url: receiver.resourceServer, accessToken: incGrant.access_token.value },
  {
    walletAddress: receiver.id,
    incomingAmount: { assetCode: receiver.assetCode, assetScale: receiver.assetScale, value: amount.toString() },
    metadata: { description: "Brivia test" },
  },
);
console.log(`📥 Incoming: ${incoming.id}`);

// 2. Request outgoing grant on sender
const outGrant = await client.grant.request(
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
if (!isPendingGrant(outGrant)) throw new Error("out grant not pending");

console.log(`\n🔗 Approve: ${outGrant.interact.redirect}\n`);
console.log("Waiting for approval...\n");

// 3. Poll for approval
let finalGrant = null;
for (let i = 0; i < 120; i++) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const r = await client.grant.continue({ url: outGrant.continue.uri, accessToken: outGrant.continue.access_token.value });
    if (isFinalizedGrantWithAccessToken(r)) { finalGrant = r; break; }
  } catch {}
}
if (!finalGrant) { console.log("❌ Timeout"); process.exit(1); }
console.log("✅ Approved!\n");

// 4. Execute outgoing payment
const payment = await client.outgoingPayment.create(
  { url: sender.resourceServer, accessToken: finalGrant.access_token.value },
  {
    walletAddress: sender.id,
    incomingPayment: incoming.id,
    debitAmount: { assetCode: sender.assetCode, assetScale: sender.assetScale, value: amount.toString() },
    metadata: { description: "Brivia test" },
  },
);
console.log(`📤 Sent!`);
console.log(`   Debit:    ${payment.debitAmount.value} ${payment.debitAmount.assetCode}`);
console.log(`   Receive:  ${payment.receiveAmount.value} ${payment.receiveAmount.assetCode}`);
console.log(`   Failed:   ${payment.failed}\n`);

// 5. Poll settlement
console.log("⏳ Polling for settlement...\n");
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000));
  try {
    const updated = await client.incomingPayment.get({ url: incoming.id, accessToken: incGrant.access_token.value });
    const recv = updated.receivedAmount?.value || "0";
    process.stdout.write(`   ${i + 1}: received=${recv} completed=${updated.completed}\r`);
    if (updated.completed || parseInt(recv) > 0) {
      console.log(`\n\n✅ Settled! received=${recv} ${receiver.assetCode}`);
      process.exit(0);
    }
  } catch (e) {
    process.stdout.write(`   ${i + 1}: polling...\r`);
  }
}
console.log("\n\n⚠️  Still pending after 60s.");
console.log("This means the ILP connector hasn't routed the payment yet.");
console.log("Check: https://ilp.interledger-test.dev/practice for balance.");
