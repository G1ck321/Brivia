/**
 * Brivia Public Payment Page
 * 
 * Fetches bill info from FastAPI backend via share token.
 * Submits payment to backend which processes through Open Payments.
 */
"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  CircleCheckBig,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { BriviaMark } from "@/components/BriviaAppShell";
import { getPublicBill, contributeToBill, initiateOpenPayments, getOpenPaymentsCallback, type PublicBill, type Payment } from "@/lib/api";

function formatMoney(minor: number): string {
  return `₦${(minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
}

function billProgress(bill: PublicBill): number {
  if (bill.amount_minor === 0) return 0;
  return Math.round((bill.amount_paid_minor / bill.amount_minor) * 100);
}

export default function PublicPayment() {
  const params = useParams();
  const token = (params?.token as string) ?? "";

  const [bill, setBill] = useState<PublicBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [contributorName, setContributorName] = useState("");
  const [amount, setAmount] = useState("");
  const [walletUrl, setWalletUrl] = useState("");
  const [paymentMode, setPaymentMode] = useState<"mock" | "openpayments">("mock");
  const [opPaymentId, setOpPaymentId] = useState("");
  const [opPolling, setOpPolling] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const idempotencyKey = useRef(`idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicBill(token)
      .then(setBill)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="public-page">
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-[#0e5f4d]" size={32} />
        </div>
      </div>
    );
  }

  if (opPolling) {
    return (
      <div className="public-page">
        <header className="public-header">
          <Link href="/" className="public-brand"><BriviaMark /></Link>
          <div className="secure-header-note"><Loader2 className="animate-spin" size={15} /> Waiting for approval…</div>
        </header>
        <main className="min-h-screen flex flex-col items-center justify-center gap-4">
          <Loader2 className="animate-spin text-[#0e5f4d]" size={40} />
          <h2 style={{ color: "#163b30" }}>Approve the payment in the wallet tab</h2>
          <p style={{ color: "#6d8178", maxWidth: 420, textAlign: "center", lineHeight: 1.6 }}>
            A wallet approval page opened in a new tab. Approve the payment there, then come back here — we'll detect it automatically.
          </p>
          <button
            className="outline-button"
            onClick={() => {
              setOpPolling(false);
              setError("");
            }}
            style={{ marginTop: 8 }}
          >
            Cancel
          </button>
        </main>
      </div>
    );
  }

  // Poll for Open Payments completion
  useEffect(() => {
    if (!opPolling || !opPaymentId || !token) return;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes
    let active = true;

    async function poll() {
      try {
        const result = await getOpenPaymentsCallback(token, opPaymentId);
        if (!active) return;
        setPayment(result.payment);
        setOpPolling(false);
      } catch {
        attempts++;
        if (active && attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else if (active) {
          setOpPolling(false);
          setError("Payment timed out. Check your wallet and try again.");
        }
      }
    }
    poll();
    return () => { active = false; };
  }, [opPolling, opPaymentId, token]);

  if (notFound || !bill) {
    return <InvalidLink />;
  }

  const remaining = bill.remaining_balance_minor;
  const progress = billProgress(bill);

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const amountMinor = Math.round(Number(amount.replace(/,/g, "")) * 100);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      setError("Enter a contribution amount greater than ₦0.");
      return;
    }
    if (amountMinor > remaining) {
      setError(`This bill has ${formatMoney(remaining)} remaining. Choose this amount or less.`);
      return;
    }
    setIsProcessing(true);
    try {
      if (paymentMode === "openpayments" && walletUrl.trim()) {
        // Open Payments flow — open wallet approval in new tab,
        // poll from this tab until payment settles
        const result = await initiateOpenPayments(token, {
          amount_minor: amountMinor,
          contributor_name: contributorName || "Anonymous",
          sender_wallet_url: walletUrl.trim(),
        });
        // Open wallet approval in new tab
        window.open(result.redirect_url, "_blank");
        // Start polling for payment completion
        setOpPaymentId(result.payment_id);
        setOpPolling(true);
        return;
      }

      // Mock payment flow
      const result = await contributeToBill(token, {
        amount_minor: amountMinor,
        contributor_name: contributorName || "Anonymous",
        idempotency_key: idempotencyKey.current,
      });
      setPayment(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (payment) {
    return (
      <Receipt
        billId={bill.public_bill_id}
        payment={payment}
        remaining={Math.max(remaining - payment.amount_minor, 0)}
      />
    );
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <Link href="/" className="public-brand"><BriviaMark /></Link>
        <div className="secure-header-note"><LockKeyhole size={15} /> Private bill view</div>
      </header>
      <main className="public-layout">
        <section className="public-intro">
          <Link href="/" className="back-link"><ChevronLeft size={17} /> Back to Brivia</Link>
          <div className="public-intro-copy">
            <div className="verified-kicker"><ShieldCheck size={15} /> Verified bill</div>
            <p className="eyebrow">Helping with {bill.public_bill_id}&apos;s care</p>
            <h1>One contribution can move care forward.</h1>
            <p>You are seeing a limited, share-safe view of this healthcare bill. No clinical details are shown here.</p>
          </div>
        </section>

        <section className="pay-card" aria-label="Contribution form">
          <div className="pay-card-heading">
            <div>
              <p className="eyebrow">Bill {bill.public_bill_id}</p>
              <h2>{bill.description}</h2>
              <p>{bill.facility_name} · due {formatDate(bill.due_date)}</p>
            </div>
            <span className={`status-pill ${bill.status.toLowerCase()}`}>
              {bill.status === "PAID" ? "Funded" : "Open"}
            </span>
          </div>
          <div className="public-balance">
            <div>
              <span>Still needed</span>
              <strong>{formatMoney(remaining)}</strong>
            </div>
            <div className="public-balance-progress">
              <span>{formatMoney(bill.amount_paid_minor)} already coordinated</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
          {bill.status === "PAID" ? (
            <div className="funded-message">
              <CircleCheckBig size={22} />
              <div>
                <strong>This care bill is fully funded.</strong>
                <span>Thank you — no further contribution is needed.</span>
              </div>
            </div>
          ) : (
            <form onSubmit={submitPayment} className="payment-form">
              <label>
                Your name <span>optional</span>
                <input
                  value={contributorName}
                  onChange={(e) => setContributorName(e.target.value)}
                  placeholder="How should this appear on the receipt?"
                />
              </label>
              <label>
                Contribution amount (NGN)
                <div className="money-input">
                  <span>₦</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="25,000"
                  />
                </div>
              </label>
              <div className="form-two-col">
                <label>Payment method
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as "mock" | "openpayments")}
                    style={{ display: "block", width: "100%", minHeight: 46, marginTop: 7, padding: "0 13px", border: "1px solid #d8e4da", borderRadius: 13, color: "#163b30", background: "#fcfdfb", fontSize: ".9rem", fontWeight: 600 }}
                  >
                    <option value="mock">Demo (Mock Payment)</option>
                    <option value="openpayments">Open Payments / ILP</option>
                  </select>
                </label>
                {paymentMode === "openpayments" && (
                  <label>Your wallet URL
                    <input
                      value={walletUrl}
                      onChange={(e) => setWalletUrl(e.target.value)}
                      placeholder="https://ilp.interledger-test.dev/your-wallet"
                    />
                  </label>
                )}
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button full public-pay-button" type="submit" disabled={isProcessing}>
                {isProcessing ? (
                  <><span className="button-spinner" /> Processing payment…</>
                ) : (
                  <>Pay now <Check size={17} /></>
                )}
              </button>
              <p className="payment-form-note">
                <LockKeyhole size={14} /> {paymentMode === "openpayments"
                  ? "You'll be redirected to your wallet to approve the payment."
                  : "Demo mode — simulated payment for testing."
                }
              </p>

            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function Receipt({ billId, payment, remaining }: { billId: string; payment: Payment; remaining: number }) {
  return (
    <div className="public-page receipt-page">
      <header className="public-header">
        <Link href="/" className="public-brand"><BriviaMark /></Link>
        <div className="secure-header-note"><ShieldCheck size={15} /> Receipt confirmed</div>
      </header>
      <main className="receipt-layout">
        <section className="receipt-card">
          <div className="receipt-success-mark"><Check size={32} /></div>
          <p className="eyebrow">Contribution recorded</p>
          <h1>Thank you for helping with care.</h1>
          <p className="receipt-intro">Your payment has been verified and recorded against this bill.</p>
          <div className="receipt-total">
            <span>Contribution</span>
            <strong>{formatMoney(payment.amount_minor)}</strong>
          </div>
          <div className="receipt-details">
            <div><span>Bill ID</span><strong>{billId}</strong></div>
            <div><span>Payment reference</span><strong>{payment.payment_reference}</strong></div>
            <div><span>Contributor</span><strong>{payment.contributor_name}</strong></div>
            <div><span>Verified at</span><strong>{new Date(payment.created_at).toLocaleString()}</strong></div>
          </div>
          <div className="receipt-balance">
            <HeartHandshake size={19} />
            <span>New bill balance: <strong>{formatMoney(remaining)}</strong></span>
          </div>
          <div className="receipt-actions">
            <button type="button" className="outline-button" onClick={() => window.print()}>Print receipt</button>
            <Link href="/" className="primary-button">View updated ledger</Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="public-page invalid-link-page">
      <header className="public-header">
        <Link href="/" className="public-brand"><BriviaMark /></Link>
      </header>
      <main className="invalid-link-card">
        <div className="receipt-success-mark muted"><LockKeyhole size={29} /></div>
        <p className="eyebrow">Secure link unavailable</p>
        <h1>This bill link cannot be opened.</h1>
        <p>It may be expired, invalid, or no longer shared. Ask the patient or provider for a new verified link.</p>
        <Link href="/" className="primary-button">Return to Brivia</Link>
      </main>
    </div>
  );
}
