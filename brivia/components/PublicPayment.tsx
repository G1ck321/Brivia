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
import { getPublicBill, contributeToBill, initiateOpenPayments, type PublicBill, type Payment } from "@/lib/api";

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
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [hasPendingPayment, setHasPendingPayment] = useState(false);
  const idempotencyKey = useRef(`idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    // Detect if user returned from wallet approval
    if (typeof window !== "undefined") {
      const pendingPaymentId = localStorage.getItem("brivia_op_payment_id");
      if (pendingPaymentId) {
        setHasPendingPayment(true);
      }
    }
  }, []);

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
        // Open Payments flow — get redirect URL, store payment_id, redirect to wallet
        const result = await initiateOpenPayments(token, {
          amount_minor: amountMinor,
          contributor_name: contributorName || "Anonymous",
          sender_wallet_url: walletUrl.trim(),
        });
        // Store payment_id in localStorage so callback page can find it
        localStorage.setItem("brivia_op_payment_id", result.payment_id);
        localStorage.setItem("brivia_op_share_token", token);
        // Redirect to wallet approval page
        window.location.href = result.redirect_url;
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
        token={token}
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
          {hasPendingPayment && (
            <div style={{ marginBottom: 20, padding: 18, borderRadius: 16, background: "#fff8e1", border: "2px solid #f9a825", display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f9a825", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Loader2 size={22} color="#fff" className="animate-spin" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: ".95rem", color: "#5d4037" }}>Waiting for your confirmation</p>
                <p style={{ margin: "4px 0 0", fontSize: ".82rem", color: "#795548" }}>
                  You approved this payment in your wallet. Tap the button below to confirm and complete it.
                </p>
                <Link
                  href={`/pay/${token}/callback`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 12,
                    padding: "12px 24px",
                    borderRadius: 12,
                    background: "#0e5f4d",
                    color: "white",
                    fontWeight: 700,
                    fontSize: ".9rem",
                    textDecoration: "none",
                  }}
                >
                  <Check size={18} /> Confirm payment now
                </Link>
              </div>
            </div>
          )}
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
              {paymentMode === "openpayments" && (
                <p style={{ marginTop: 8, fontSize: ".75rem", color: "#81948b" }}>
                  Already approved? <Link href={`/pay/${token}/callback`} style={{ color: "#0e5f4d", textDecoration: "underline" }}>Check payment status</Link>
                </p>
              )}
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function Receipt({ billId, payment, remaining, token }: { billId: string; payment: Payment; remaining: number; token: string }) {
  const netAmount = Math.round(payment.amount_minor * 0.98);
  const platformFee = payment.amount_minor - netAmount;
  return (
    <div className="public-page receipt-page">
      <header className="public-header">
        <Link href="/" className="public-brand"><BriviaMark /></Link>
        <div className="secure-header-note"><ShieldCheck size={15} /> Payment confirmed</div>
      </header>
      <main className="receipt-layout">
        <section className="receipt-card">
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#dcf0e4", display: "grid", placeItems: "center", marginBottom: 16 }}>
            <Check size={36} color="#0e5f4d" strokeWidth={3} />
          </div>
          <p className="eyebrow">Payment successful</p>
          <h1 style={{ fontSize: "1.6rem", marginBottom: 8 }}>Thank you, {payment.contributor_name}!</h1>
          <p className="receipt-intro" style={{ maxWidth: 420 }}>
            Your <strong>{formatMoney(payment.amount_minor)}</strong> contribution has been recorded against this healthcare bill.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24, marginBottom: 20 }}>
            <div style={{ padding: 16, borderRadius: 16, background: "#0e5f4d", color: "white" }}>
              <p style={{ margin: 0, fontSize: ".68rem", color: "#c7e4d5", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>You contributed</p>
              <strong style={{ fontSize: "1.4rem", marginTop: 4, display: "block" }}>{formatMoney(payment.amount_minor)}</strong>
            </div>
            <div style={{ padding: 16, borderRadius: 16, background: "#f5f8f1" }}>
              <p style={{ margin: 0, fontSize: ".68rem", color: "#72877c", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>Applied to bill</p>
              <strong style={{ fontSize: "1.4rem", marginTop: 4, display: "block", color: "#0e5f4d" }}>{formatMoney(netAmount)}</strong>
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: "#f5f8f1" }}>
            <p style={{ margin: 0, fontSize: ".72rem", fontWeight: 800, color: "#72877c", textTransform: "uppercase", letterSpacing: ".08em" }}>Platform fee</p>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: ".85rem" }}>
              <span style={{ color: "#6d8178" }}>Brivia (2%)</span>
              <strong style={{ color: "#99733e" }}>{formatMoney(platformFee)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: ".85rem" }}>
              <span style={{ color: "#6d8178" }}>Net to bill</span>
              <strong style={{ color: "#0e5f4d" }}>{formatMoney(netAmount)}</strong>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
            <div style={{ fontSize: ".78rem" }}>
              <span style={{ color: "#81948b" }}>Bill ID</span><br/>
              <strong style={{ fontSize: ".75rem" }}>{billId}</strong>
            </div>
            <div style={{ fontSize: ".78rem" }}>
              <span style={{ color: "#81948b" }}>Reference</span><br/>
              <strong style={{ fontSize: ".75rem" }}>{payment.payment_reference}</strong>
            </div>
          </div>
          <div style={{ marginTop: 20, padding: 14, borderRadius: 14, background: "#dcf0e4", display: "flex", alignItems: "center", gap: 10 }}>
            <HeartHandshake size={18} color="#0e5f4d" />
            <span style={{ fontSize: ".82rem", color: "#163b30" }}>Bill balance updated: <strong>{formatMoney(remaining)}</strong> remaining</span>
          </div>
          <div className="receipt-actions" style={{ marginTop: 24 }}>
            <button type="button" className="outline-button" onClick={() => window.print()}>Print receipt</button>
            <Link href={`/pay/${token}`} className="primary-button">Back to bill</Link>
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
