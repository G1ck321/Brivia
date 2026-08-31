/**
 * Open Payments Callback Page
 *
 * After the contributor approves the payment in their wallet,
 * the wallet redirects back here. We call the backend to finalize
 * the payment and show the receipt.
 */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Check, HeartHandshake, LockKeyhole, ShieldCheck, Loader2, XCircle } from "lucide-react";
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
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // paymentId can come from URL query param OR localStorage
    const effectivePaymentId = paymentId ||
      (typeof window !== "undefined" ? localStorage.getItem("brivia_op_payment_id") : "") ||
      "";
    const effectiveToken = token ||
      (typeof window !== "undefined" ? localStorage.getItem("brivia_op_share_token") : "") ||
      "";

    if (!effectiveToken || !effectivePaymentId) {
      setStatus("error");
      setErrorMessage("Missing payment information. Please return to the payment page and try again.");
      return;
    }

    // Use effective values for the API call
    const resolvedToken = effectiveToken;
    const resolvedPaymentId = effectivePaymentId;

    // Poll the callback endpoint until payment is finalized
    let attempts = 0;
    const maxAttempts = 30;
    let active = true;

    async function checkPayment() {
      try {
        const result = await getOpenPaymentsCallback(resolvedToken, resolvedPaymentId);
        if (!active) return;
        setPayment(result.payment);
        setBillStatus(result.bill_status);
        setReceivedAmount(result.received_amount);
        setStatus("success");
        // Clean up localStorage
        localStorage.removeItem("brivia_op_payment_id");
        localStorage.removeItem("brivia_op_share_token");
      } catch {
        attempts++;
        if (active && attempts < maxAttempts) {
          setTimeout(checkPayment, 2000);
        } else if (active) {
          setStatus("error");
          setErrorMessage("Payment could not be confirmed. Please check your wallet and try again.");
        }
      }
    }

    // Small delay to let the backend finalize
    setTimeout(checkPayment, 1500);

    return () => { active = false; };
  }, [token, paymentId]);

  if (status === "loading") {
    return (
      <div className="public-page">
        <header className="public-header">
          <Link href="/" className="public-brand"><BriviaMark /></Link>
          <div className="secure-header-note"><Loader2 className="animate-spin" size={15} /> Processing…</div>
        </header>
        <main className="min-h-screen flex flex-col items-center justify-center gap-4">
          <Loader2 className="animate-spin text-[#0e5f4d]" size={40} />
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
          <Link href={`/pay/${token}`} className="primary-button" style={{ marginTop: 16 }}>
            Try again
          </Link>
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
          <div className="receipt-success-mark"><Check size={32} /></div>
          <p className="eyebrow">Open Payments transfer complete</p>
          <h1>Payment settled via Interledger.</h1>
          <p className="receipt-intro">
            Your wallet approved the payment and the funds have been received through the ILP network.
          </p>
          <div className="receipt-total">
            <span>Contribution</span>
            <strong>{formatMoney(payment!.amount_minor)}</strong>
          </div>
          <div className="receipt-details">
            <div><span>Bill ID</span><strong>{payment!.bill_id}</strong></div>
            <div><span>Payment reference</span><strong>{payment!.payment_reference}</strong></div>
            <div><span>Contributor</span><strong>{payment!.contributor_name}</strong></div>
            <div><span>Status</span><strong>{payment!.status}</strong></div>
            <div><span>ILP received</span><strong>{receivedAmount} base units</strong></div>
            <div><span>Verified at</span><strong>{new Date(payment!.created_at).toLocaleString()}</strong></div>
          </div>
          <div className="receipt-balance">
            <HeartHandshake size={19} />
            <span>Bill status: <strong>{billStatus}</strong></span>
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
