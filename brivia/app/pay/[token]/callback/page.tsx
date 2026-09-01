/**
 * Open Payments Callback Page
 *
 * After the contributor approves the payment in their wallet,
 * they come back here. We finalize the payment and show the receipt.
 */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Check, HeartHandshake, ShieldCheck, Loader2, XCircle } from "lucide-react";
import { BriviaMark } from "@/components/BriviaAppShell";
import { getOpenPaymentsCallback, type Payment } from "@/lib/api";

function formatMoney(minor: number): string {
  return `₦${(minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

export default function OpenPaymentsCallback() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = (params?.token as string) ?? "";
  const paymentId = searchParams.get("payment_id") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [billStatus, setBillStatus] = useState("");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [grossAmount, setGrossAmount] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Get payment_id from URL or localStorage
    const effectivePaymentId = paymentId ||
      (typeof window !== "undefined" ? localStorage.getItem("brivia_op_payment_id") : "") || "";
    const effectiveToken = token ||
      (typeof window !== "undefined" ? localStorage.getItem("brivia_op_share_token") : "") || "";

    if (!effectiveToken || !effectivePaymentId) {
      setStatus("error");
      setErrorMessage("Missing payment information. Please return to the payment page and try again.");
      return;
    }

    // Poll until payment is finalized (backend calls OP server to finalize)
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes
    let active = true;

    async function poll() {
      try {
        const result = await getOpenPaymentsCallback(effectiveToken, effectivePaymentId);
        if (!active) return;
        setPayment(result.payment);
        setBillStatus(result.bill_status);
        setReceivedAmount(result.received_amount);
        setGrossAmount(result.gross_amount);
        setPlatformFee(result.platform_fee);
        setNetAmount(result.net_amount);
        setStatus("success");
        // Clean up localStorage
        localStorage.removeItem("brivia_op_payment_id");
        localStorage.removeItem("brivia_op_share_token");
      } catch (err) {
        attempts++;
        // 409 means the network is still settling — keep polling
        const isStillProcessing = err instanceof Error && err.message.includes("409");
        if (active && attempts < maxAttempts) {
          const delay = isStillProcessing ? 2500 : 2000;
          setTimeout(poll, delay);
        } else if (active) {
          setStatus("error");
          setErrorMessage("Payment could not be finalized. The wallet may not have approved yet, or the network hasn't settled. Try again.");
        }
      }
    }

    // Small delay to let the backend finalize
    setTimeout(poll, 1500);

    return () => { active = false; };
  }, [token, paymentId]);

  if (status === "loading") {
    return (
      <div className="public-page">
        <header className="public-header">
          <Link href="/" className="public-brand"><BriviaMark /></Link>
          <div className="secure-header-note"><Loader2 className="animate-spin-slow" size={15} /> Processing…</div>
        </header>
        <main className="min-h-screen flex flex-col items-center justify-center gap-4">
          <Loader2 className="" size={40} />
          <h2 style={{ color: "#163b30" }}>Finalizing your payment…</h2>
          <p style={{ color: "#6d8178", maxWidth: 400, textAlign: "center" }}>
            Your wallet approved the payment. We're waiting for the Interledger network to settle the funds. This usually takes 2–10 seconds.
          </p>
        </main>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="public-page">
        <header className="public-header">
          <Link href="/" className="public-brand"><BriviaMark /></Link>
          <div className="secure-header-note"><XCircle size={15} /> Payment issue</div>
        </header>
        <main className="min-h-screen flex flex-col items-center justify-center gap-4">
          <div className="receipt-success-mark muted"><XCircle size={29} /></div>
          <h2 style={{ color: "#163b30" }}>Payment could not be confirmed</h2>
          <p style={{ color: "#6d8178", maxWidth: 400, textAlign: "center" }}>{errorMessage}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <Link href={`/pay/${token}`} className="primary-button">Try again</Link>
            <Link href="/" className="outline-button">Back to Brivia</Link>
          </div>
        </main>
      </div>
    );
  }

  // Success
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
          <h1 style={{ fontSize: "1.6rem", marginBottom: 8 }}>Thank you, {payment!.contributor_name}!</h1>
          <p className="receipt-intro" style={{ maxWidth: 420 }}>
            Your <strong>{formatMoney(payment!.amount_minor)}</strong> contribution has been sent via the Interledger network and applied to this healthcare bill.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24, marginBottom: 20 }}>
            <div style={{ padding: 16, borderRadius: 16, background: "#0e5f4d", color: "white" }}>
              <p style={{ margin: 0, fontSize: ".68rem", color: "#c7e4d5", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>You contributed</p>
              <strong style={{ fontSize: "1.4rem", marginTop: 4, display: "block" }}>{formatMoney(payment!.amount_minor)}</strong>
            </div>
            <div style={{ padding: 16, borderRadius: 16, background: "#f5f8f1" }}>
              <p style={{ margin: 0, fontSize: ".68rem", color: "#72877c", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>Applied to bill</p>
              <strong style={{ fontSize: "1.4rem", marginTop: 4, display: "block", color: "#0e5f4d" }}>{formatMoney(netAmount)}</strong>
            </div>
          </div>

          <div style={{ padding: 16, borderRadius: 16, background: "#f5f8f1" }}>
            <p style={{ margin: 0, fontSize: ".72rem", fontWeight: 800, color: "#72877c", textTransform: "uppercase", letterSpacing: ".08em" }}>How it was split</p>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: ".85rem" }}>
              <span style={{ color: "#6d8178" }}>ILP network fee</span>
              <strong style={{ color: "#99733e" }}>{formatMoney(grossAmount - receivedAmount)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: ".85rem" }}>
              <span style={{ color: "#6d8178" }}>Brivia platform (2%)</span>
              <strong style={{ color: "#99733e" }}>{formatMoney(platformFee)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: ".85rem" }}>
              <span style={{ color: "#6d8178" }}>Net to patient bill</span>
              <strong style={{ color: "#0e5f4d" }}>{formatMoney(netAmount)}</strong>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
            <div style={{ fontSize: ".78rem" }}>
              <span style={{ color: "#81948b" }}>Reference</span><br/>
              <strong style={{ fontSize: ".75rem", wordBreak: "break-all" }}>{payment!.payment_reference}</strong>
            </div>
            <div style={{ fontSize: ".78rem" }}>
              <span style={{ color: "#81948b" }}>Confirmed</span><br/>
              <strong style={{ fontSize: ".75rem" }}>{new Date(payment!.created_at).toLocaleString()}</strong>
            </div>
          </div>

          <div style={{ marginTop: 24, padding: 14, borderRadius: 14, background: "#dcf0e4", display: "flex", alignItems: "center", gap: 10 }}>
            <HeartHandshake size={18} color="#0e5f4d" />
            <span style={{ fontSize: ".82rem", color: "#163b30" }}>This care bill is now <strong>{billStatus === "PAID" ? "fully funded" : `partially funded (${billStatus})`}</strong></span>
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
