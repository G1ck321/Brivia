/**
 * Brivia Patient Dashboard
 *
 * Shows the patient's bills and share links from the FastAPI backend.
 */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  ExternalLink,
  HeartHandshake,
  Loader2,
  MessageCircleMore,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { BriviaAppShell } from "@/components/BriviaAppShell";
import { getMyBills, shareBill, type Bill } from "@/lib/api";

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

function billProgress(bill: Bill): number {
  if (bill.amount_minor === 0) return 0;
  return Math.round((bill.amount_paid_minor / bill.amount_minor) * 100);
}

export default function PatientDashboard() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [activeBill, setActiveBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadBills();
  }, []);

  async function loadBills() {
    try {
      const data = await getMyBills();
      setBills(data);
      if (data.length > 0) setActiveBill(data[0]);
    } catch {
      toast.error("Failed to load your bills");
    } finally {
      setLoading(false);
    }
  }

  async function loadShareUrl(bill: Bill) {
    try {
      const result = await shareBill(bill.id);
      setShareUrl(result.share_url);
    } catch {
      setShareUrl("");
    }
  }

  useEffect(() => {
    if (activeBill) loadShareUrl(activeBill);
  }, [activeBill]);

  const share = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Payment link copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy the link.");
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

  if (!activeBill) {
    return (
      <BriviaAppShell>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#6d8278]">No bills found for your account.</p>
            <Link href="/" className="primary-button mt-4 inline-flex">Go home</Link>
          </div>
        </div>
      </BriviaAppShell>
    );
  }

  const bill = activeBill;
  const progress = billProgress(bill);

  return (
    <BriviaAppShell>
      <div className="workspace-header patient-heading">
        <div>
          <p className="eyebrow">Patient view <span className="live-dot" /> shared securely</p>
          <h1>Your care has a circle.</h1>
          <p className="header-subtitle">See the live balance once, then share a protected contribution link with people you trust.</p>
        </div>
      </div>

      <section className="patient-grid">
        <article className="patient-bill-card">
          <div className="patient-card-top">
            <div>
              <div className="verified-kicker"><ShieldCheck size={15} /> Verified for sharing</div>
              <p className="bill-id">{bill.public_bill_id}</p>
            </div>
            <div className="status-orb"><HeartHandshake size={25} /></div>
          </div>
          <div className="patient-bill-title">
            <p>Healthcare bill</p>
            <h2>{bill.description}</h2>
            <span>Due {formatDate(bill.due_date)}</span>
          </div>
          <div className="patient-amount-row">
            <div><small>Contributions received</small><strong>{formatMoney(bill.amount_paid_minor)}</strong></div>
            <div><small>Still needed</small><strong>{formatMoney(bill.remaining_balance_minor)}</strong></div>
          </div>
          <div className="progress-stack">
            <div className="progress-meta">
              <span>Your care balance</span>
              <strong>{progress}% coordinated</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </article>

        <article className="patient-share-card">
          <div className="share-card-intro">
            <div className="soft-icon lime"><MessageCircleMore size={20} /></div>
            <div>
              <p className="eyebrow">Make it easy to help</p>
              <h2>Share this bill privately.</h2>
              <p>Supporters see only the verified payment information they need.</p>
            </div>
          </div>
          <div className="share-card-body">
            <div className="patient-qr">
              <QRCodeSVG value={shareUrl || "https://brivia.app"} size={154} bgColor="#ffffff" fgColor="#0e5f4d" level="Q" includeMargin />
            </div>
            <div className="share-link-block">
              <label>Secure contribution link</label>
              <div className="share-url">{shareUrl ? shareUrl.replace(/^https?:\/\//, "") : "Loading..."}</div>
              <button className="primary-button" type="button" onClick={share}>
                {copied ? <><Check size={17} /> Copied</> : <><Copy size={17} /> Copy secure link</>}
              </button>
              {shareUrl && (
                <Link className="outline-button open-link" href={`/pay/${shareUrl.split("/pay/")[1] || ""}`}>
                  Open payment page <ExternalLink size={16} />
                </Link>
              )}
            </div>
          </div>
          <div className="share-safety">
            <ShieldCheck size={16} />
            <span>This link shows a limited bill view. In production, tokens are server-issued and expirable.</span>
          </div>
        </article>
      </section>

      {bills.length > 1 && (
        <section className="bill-list-section">
          <div className="section-heading">
            <div><p className="eyebrow">Your bills</p><h2>All care ledgers</h2></div>
          </div>
          <div className="bill-table-card">
            {bills.map((b) => (
              <button
                className={`bill-table-row ${b.id === bill.id ? "selected" : ""}`}
                type="button"
                key={b.id}
                onClick={() => setActiveBill(b)}
              >
                <span><strong>{b.public_bill_id}</strong><small>{b.patient_name}</small></span>
                <span><strong>{formatMoney(b.amount_paid_minor)}</strong><small>of {formatMoney(b.amount_minor)}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </BriviaAppShell>
  );
}
