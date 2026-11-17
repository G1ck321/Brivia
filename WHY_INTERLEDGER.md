# Why Interledger is load-bearing here

A fair challenge to any Open Payments project: *couldn't Stripe, Paystack or a
bank transfer do this?* For a single-currency, single-country, card-funded gift,
yes. Interledger is not to be praised in the abstract — it is the right primitive
for four specific things this product cannot fake, and it is the wrong tool for a
handful of others. Both halves matter.

## 1. What only Interledger/Open Payments gives us

| Capability | What it replaces | Why a card/transfer rail can't |
|---|---|---|
| **Wallet-to-wallet settlement with payer-held consent** | Stored card / direct debit mandate | The contributor authorises a bounded debit for *this* bill in *their* wallet. Brivia never holds card data or a reusable mandate. |
| **Price before approval (`quote`)** | Guessing the FX rate, then reconciling a surprise | A GNAP quote returns `debitAmount → receiveAmount` for this payment. The sender sees what leaves and what arrives, which is exactly what remittance apps hide. |
| **Addressable payment endpoints** | "Send to account 0123456789, reference BRV-1234" | An *incoming payment URL* is created per bill. Money can only settle into that resource, not into a person's account where it can be spent on something else. |
| **Provable delivery** | A screenshot of a bank alert | The provider's incoming payment reports `receivedAmount` and `completed`. The receipt points at a settlement fact, not a claim. |

That fourth row is the product. "Did my money reach **this** bill?" is the
question the diaspora payer cannot answer today, and a bank reference number is
not an answer — it is a string the patient could have typed.

## 2. The cross-border problem, concretely

A sibling in London funding a ₦500,000 bill in Lagos currently experiences:

1. **FX spread + transfer fee**: 3–8% all-in, often with the rate hidden inside
   the exchange rather than shown as a fee.
2. **Settlement delay**: hours to days, while the hospital wants payment now.
3. **No end-to-end reference**: the sender's app says "delivered", the hospital
   says "we haven't seen it", and the patient is in the middle with screenshots.
4. **No partial funding model**: five relatives each sending money separately
   means five transfers, five fee events, and no shared view of remaining need.
5. **Currency mismatch**: the bill is denominated in NGN, the payer thinks in GBP,
   and nobody can quote the conversion for *this* payment at *this* moment.

Interledger addresses (3), (4) and (5) structurally: one incoming payment per
bill absorbs many outgoing payments, each priced by a quote, each independently
verifiable. (1) and (2) improve because settlement is direct and the rate is
quoted rather than embedded — but a testnet demo cannot prove real-world pricing.
Say that plainly instead of implying otherwise.

## 3. Where Interledger is *not* the answer

- **Domestic card payments.** If a Nigerian contributor wants to tap a card, a
  local PSP is better: better UX, dispute handling, consumer protection.
- **Chargebacks and refunds.** ILP settlement is effectively final. Refunds are a
  business process we would have to build, not a rail feature.
- **Regulation.** Wallet custody, KYC/AML and money-transmission licensing are
  not solved by the protocol; they are the hard part of going live.
- **Fiat on/off ramps.** Someone still has to move value between a bank account
  and a wallet. Interledger moves value between wallets.

The honest positioning: **Interledger is the settlement and proof layer, not the
whole payment stack.** Brivia is the bill layer on top — itemisation, partial
funding, receipts, reconciliation — which wallets do not provide.

## 4. How a patient bill can be altered, and what we do about it

This is the threat that kills trust in healthcare crowdfunding, so it deserves
specifics rather than a shield icon.

**Attack 1 — the total changes after the fact.**
A provider (or anyone with database access) raises a ₦200,000 bill to ₦2,000,000
after contributors have paid. Contributors see a new number and no way to know.

*Mitigation.* The provider seals the bill: an HMAC over
`public_bill_id | amount_minor | currency | due_date | provider_id`
(`app/services/v2/verify.py`). The public verify endpoint recomputes it. A changed
total fails verification and the UI shows "do not pay".

**Attack 2 — the due date or provider identity is swapped.**
Extending a due date hides that a bill is overdue; changing `provider_id` moves
the payment destination. Both fields are inside the signed payload, so both break
the seal.

**Attack 3 — line items are re-cut to look funded.**
A ₦40,000 line is split into "covered" and "new balance" lines. Line totals must
equal the signed bill total, and lines are locked once any payment exists
(`replace_lines` refuses after `amount_paid_minor > 0`).

**Attack 4 — the share link is reused for a different bill.**
Tokens are random, scoped to one bill, now expire (30 days by default) and can be
revoked by the provider (`DELETE /bills/{id}/share`). An expired or revoked token
behaves exactly like a missing one.

**Attack 5 — the receipt is forged.**
Receipts are looked up by payment reference and include the quote/ledger-derived
fee and net, so a screenshot can be checked against `/v2/public/receipts/{ref}`.

### What this does *not* solve

- **A provider signing a lie.** The seal proves the bill has not changed since the
  provider signed it; it does not prove the provider is real or the treatment
  happened. That needs facility onboarding, document attestation and eventually
  provider keys issued by a registry.
- **A compromised database.** HMAC with the deployment secret detects edits made
  through the application or by someone with partial DB access, but an attacker
  holding both the DB and the secret can re-sign. Per-provider Ed25519 keys with
  the private key held by the provider (or a registry) close that gap.
- **Insider changes before signing.** If the provider signs after editing, the seal
  vouches for the edited bill. Verification is a consistency check, not an audit.

Say this out loud in the pitch. "We detect post-signature tampering, and our
roadmap is per-provider keys" is a stronger claim than "tamper-proof".

## 5. One-line answers for judges

- **"Why not Stripe?"** Stripe moves money to a person. Interledger moves it to a
  *bill*, with a quote before consent and a settlement fact a contributor can check.
- **"Why not GoFundMe?"** A campaign raises a lump sum with no line-level
  accounting and no provider reconciliation. We fund identified items on a bill.
- **"What's uniquely Open Payments here?"** The GNAP quote (price before approval)
  and the per-bill incoming payment (a destination that can only mean this bill).
- **"Can the bill be faked?"** It can be signed badly, but it cannot be edited
  after signing without the public verify endpoint failing — and we show that in
  the demo by changing a total and watching the badge flip.
