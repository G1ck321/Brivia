/**
 * Brivia Bill Detail Page
 *
 * Shows bill details, payment history, and share options.
 */
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  HeartHandshake,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { BriviaAppShell } from "@/components/BriviaAppShell";
import {
  getBill,
  getBillPayments,
  shareBill,
  type Bill,
  type Payment,
} from "@/lib/api";

function formatMoney(minor: number): string {
  return `₦${(minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function billProgress(bill: Bill): number {
  if (bill.amount_minor === 0) return 0;
  return Math.round((bill.amount_paid_minor / bill.amount_minor) * 100);
}

function statusCopy(status: string) {
  if (status === "PAID") return "Fully funded";
  if (status === "PARTIALLY_PAID") return "Partially funded";
  if (status === "OVERDUE") return "Overdue";
  if (status === "CANCELLED") return "Cancelled";
  return "Awaiting support";
}

export default function BillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const billId = params.id as string;

  const [bill, setBill] = useState<Bill | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [billData, paymentsData] = await Promise.all([
          getBill(billId),
          getBillPayments(billId),
        ]);
        setBill(billData);
        setPayments(paymentsData);

        const share = await shareBill(billId);
        setShareUrl(share.share_url);
      } catch {
        toast.error("Failed to load bill details");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [billId]);

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Payment link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (loading) {
    return (
      <BriviaAppShell>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin-slow text-[#0e5f4d]" size={28} />
        </div>
      </BriviaAppShell>
    );
  }

  if (!bill) {
    return (
      <BriviaAppShell>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#6d8278]">Bill not found.</p>
            <Link href="/" className="primary-button mt-4 inline-flex">Go home</Link>
          </div>
        </div>
      </BriviaAppShell>
    );
  }

  const progress = billProgress(bill);

  return (
    <BriviaAppShell>
      <div className="workspace-header">
        <div>
          <button
            className="back-link"
            type="button"
            onClick={() => router.back()}
            style={{ marginBottom: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="verified-kicker"><ShieldCheck size={15} /> Verified bill</div>
          <h1>{bill.public_bill_id}</h1>
          <p className="header-subtitle">{bill.description}</p>
        </div>
        <div className="header-actions">
          <span className={`status-pill ${bill.status.toLowerCase()}`}>{statusCopy(bill.status)}</span>
        </div>
      </div>

      <div className="bill-detail-layout" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        {/* Left column — bill details + payment history */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div style={{ padding: 22, borderRadius: 18, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <p style={{ fontSize: ".7rem", color: "#81948b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Total bill</p>
              <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0e5f4d", letterSpacing: "-.06em", marginTop: 6 }}>{formatMoney(bill.amount_minor)}</div>
            </div>
            <div style={{ padding: 22, borderRadius: 18, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <p style={{ fontSize: ".7rem", color: "#81948b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Received</p>
              <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#287153", letterSpacing: "-.06em", marginTop: 6 }}>{formatMoney(bill.amount_paid_minor)}</div>
            </div>
            <div style={{ padding: 22, borderRadius: 18, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <p style={{ fontSize: ".7rem", color: "#81948b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Remaining</p>
              <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#99733e", letterSpacing: "-.06em", marginTop: 6 }}>{formatMoney(bill.remaining_balance_minor)}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ padding: 22, borderRadius: 18, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            <div className="progress-stack">
              <div className="progress-meta">
                <span>{formatMoney(bill.amount_paid_minor)} of {formatMoney(bill.amount_minor)}</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 16, fontSize: ".78rem", color: "#6d8278" }}>
              <span>Patient: <strong style={{ color: "#173c31" }}>{bill.patient_name}</strong></span>
              <span>Due: <strong style={{ color: "#173c31" }}>{formatDate(bill.due_date)}</strong></span>
              <span>Created: <strong style={{ color: "#173c31" }}>{formatDate(bill.created_at)}</strong></span>
            </div>
          </div>

          {/* Payment history */}
          <div style={{ padding: 22, borderRadius: 18, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: "-.04em" }}>Payment history</h3>
                <p style={{ fontSize: ".76rem", color: "#81948b", marginTop: 2 }}>{payments.length} contribution{payments.length !== 1 ? "s" : ""}</p>
              </div>
              {shareUrl && (
                <Link href={`/pay/${shareUrl.split("/pay/")[1] || ""}`} className="outline-button" style={{ padding: "6px 14px", fontSize: ".76rem", minHeight: "auto" }}>
                  Make a payment <ExternalLink size={14} />
                </Link>
              )}
            </div>

            {payments.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#81948b", fontSize: ".84rem" }}>
                <HeartHandshake size={28} style={{ margin: "0 auto 12px", color: "#c7dfc7" }} />
                <p>No contributions yet.</p>
                <p style={{ fontSize: ".76rem", marginTop: 4 }}>Share the payment link to start receiving support.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {/* Table header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 120px 100px 140px",
                  padding: "10px 12px", fontSize: ".66rem", fontWeight: 800, color: "#84968d",
                  textTransform: "uppercase", letterSpacing: ".08em", borderBottom: "1px solid #edf1eb",
                }}>
                  <span>Contributor</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Date</span>
                </div>
                {payments.map((p) => (
                  <div key={p.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 120px 100px 140px",
                    padding: "14px 12px", borderBottom: "1px solid #f4f6f3",
                    fontSize: ".82rem", alignItems: "center",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, background: "#e7f2dc",
                        display: "grid", placeItems: "center", fontSize: ".68rem", fontWeight: 800, color: "#0e5f4d",
                      }}>
                        {p.contributor_name ? p.contributor_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2) : "??"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#173c31" }}>{p.contributor_name || "Anonymous"}</div>
                        <div style={{ fontSize: ".68rem", color: "#81948b" }}>{p.payment_reference?.slice(0, 12) || "—"}</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: "#0e5f4d" }}>{formatMoney(p.amount_minor)}</div>
                    <div>
                      <span className={`tiny-status ${p.status.toLowerCase()}`} style={{ fontSize: ".68rem" }}>
                        {p.status === "COMPLETED" ? "Confirmed" : p.status === "PENDING" ? "Pending" : p.status}
                      </span>
                    </div>
                    <div style={{ fontSize: ".76rem", color: "#6d8278" }}>{formatDateTime(p.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — share card */}
        <div style={{ position: "sticky", top: 24 }}>
          <div style={{ padding: 24, borderRadius: 22, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: "#e7f2dc", display: "grid", placeItems: "center" }}>
                <Copy size={16} color="#0e5f4d" />
              </div>
              <div>
                <h3 style={{ fontSize: ".92rem", fontWeight: 800 }}>Share this bill</h3>
                <p style={{ fontSize: ".72rem", color: "#81948b" }}>Send the payment link to supporters</p>
              </div>
            </div>

            <div style={{ display: "grid", placeItems: "center", padding: 16, background: "#f5f8f1", borderRadius: 16, marginBottom: 16 }}>
              <QRCodeSVG value={shareUrl || "https://brivia.app"} size={140} bgColor="#f5f8f1" fgColor="#0e5f4d" level="M" includeMargin />
            </div>

            <div style={{ fontSize: ".68rem", fontWeight: 800, color: "#72877c", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
              Payment link
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: "#f0f5ef", fontSize: ".72rem", color: "#3b6655", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 12 }}>
              {shareUrl ? shareUrl.replace(/^https?:\/\//, "") : "Loading..."}
            </div>

            <button className="primary-button full" type="button" onClick={copyShare}>
              {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy payment link</>}
            </button>

            {shareUrl && (
              <Link href={`/pay/${shareUrl.split("/pay/")[1] || ""}`} className="outline-button full" style={{ marginTop: 8 }}>
                Preview pay page <ExternalLink size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </BriviaAppShell>
  );
}
