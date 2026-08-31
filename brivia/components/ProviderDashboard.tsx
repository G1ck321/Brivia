/**
 * Brivia Provider Dashboard
 * 
 * Calls FastAPI backend for bill management.
 */
"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleCheck,
  Copy,
  FilePlus2,
  HeartHandshake,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BriviaAppShell } from "@/components/BriviaAppShell";
import {
  createBill,
  getMyBills,
  shareBill,
  type Bill,
} from "@/lib/api";

function formatMoney(minor: number): string {
  return `₦${(minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
}

function billProgress(bill: Bill): number {
  if (bill.amount_minor === 0) return 0;
  return Math.round((bill.amount_paid_minor / bill.amount_minor) * 100);
}

function statusCopy(status: string) {
  if (status === "PAID") return "Funded";
  if (status === "PARTIALLY_PAID") return "In progress";
  return "Awaiting support";
}

export default function ProviderDashboard() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [activeBill, setActiveBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  // Create form state
  const [patientName, setPatientName] = useState("");
  const [description, setDescription] = useState("Outpatient treatment support");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("2026-09-05");

  useEffect(() => {
    loadBills();
  }, []);

  async function loadBills() {
    try {
      const data = await getMyBills();
      setBills(data);
      if (data.length > 0) setActiveBill(data[0]);
    } catch (err) {
      toast.error("Failed to load bills");
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

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Payment link copied");
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  const submitBill = async (event: FormEvent) => {
    event.preventDefault();
    const amountMinor = Math.round(Number(amount.replace(/,/g, "")) * 100);
    if (!patientName.trim() || !description.trim() || !dueDate || !Number.isInteger(amountMinor) || amountMinor <= 0) {
      toast.error("Add a patient, description, positive amount, and due date.");
      return;
    }
    try {
      const created = await createBill({
        patient_name: patientName,
        description,
        amount_minor: amountMinor,
        due_date: dueDate,
      });
      setPatientName("");
      setDescription("Outpatient treatment support");
      setAmount("");
      setShowCreate(false);
      await loadBills();
      setActiveBill(created);
      toast.success(`${created.public_bill_id} is ready to share`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bill");
    }
  };

  if (loading) {
    return (
      <BriviaAppShell>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-[#6d8278]">Loading bills…</p>
        </div>
      </BriviaAppShell>
    );
  }

  const bill = activeBill;
  const progress = bill ? billProgress(bill) : 0;

  return (
    <BriviaAppShell>
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Provider workspace <span className="live-dot" /> live</p>
          <h1>Welcome back.</h1>
          <p className="header-subtitle">Coordinate care costs with a clear, verified bill for every supporter.</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            <Plus size={18} /> Create a bill
          </button>
        </div>
      </div>

      {bill && (
        <section className="provider-grid" aria-label="Provider bill workspace">
          <article className="bill-hero-card">
            <div className="bill-hero-top">
              <div>
                <div className="verified-kicker"><ShieldCheck size={15} /> Verified bill</div>
                <p className="bill-id">{bill.public_bill_id}</p>
              </div>
              <span className={`status-pill ${bill.status.toLowerCase()}`}>{statusCopy(bill.status)}</span>
            </div>
            <div className="bill-hero-copy">
              <p className="patient-label">For {bill.patient_name}</p>
              <h2>{bill.description}</h2>
              <p>Due {formatDate(bill.due_date)}</p>
            </div>
            <div className="amount-display">
              <div>
                <span>Total care bill</span>
                <strong>{formatMoney(bill.amount_minor)}</strong>
              </div>
              <div className="amount-divider" />
              <div>
                <span>Still needed</span>
                <strong className="remaining-amount">{formatMoney(bill.remaining_balance_minor)}</strong>
              </div>
            </div>
            <div className="progress-stack" aria-label={`${progress}% funded`}>
              <div className="progress-meta">
                <span>{formatMoney(bill.amount_paid_minor)} coordinated</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="bill-hero-actions">
              <button className="button-on-dark" type="button" onClick={copyShare}>
                <Copy size={16} /> Copy payment link
              </button>
              {shareUrl && (
                <Link href={`/pay/${shareUrl.split("/pay/")[1] || ""}`} className="button-ghost-on-dark">
                  Preview pay page <ArrowUpRight size={16} />
                </Link>
              )}
            </div>
          </article>

          <article className="clinic-card">
            <div className="clinic-card-content">
              <div className="soft-icon"><CircleCheck size={19} /></div>
              <p className="eyebrow">Verified bill</p>
              <h3>{bill.public_bill_id}</h3>
              <p>Payments remain attached to a traceable Bill ID.</p>
            </div>
          </article>

          <article className="stats-card supported-card">
            <div className="soft-icon lime"><HeartHandshake size={19} /></div>
            <span>Care support received</span>
            <strong>{formatMoney(bill.amount_paid_minor)}</strong>
            <p><span className="positive-text">+{Math.round(bill.amount_paid_minor / 100000) || 0}</span> confirmed</p>
          </article>

          <article className="share-mini-card">
            <div className="qr-wrap">
              <QRCodeSVG value={shareUrl || "https://brivia.app"} size={78} bgColor="#eff7f1" fgColor="#0e5f4d" level="M" includeMargin />
            </div>
            <div>
              <p className="eyebrow">Share-ready</p>
              <h3>One bill, many ways to help.</h3>
              <p>Patients can send the QR code, payment link, or Bill ID.</p>
            </div>
            <button className="outline-button" type="button" onClick={copyShare}>Copy link</button>
          </article>
        </section>
      )}

      <section className="bill-list-section">
        <div className="section-heading">
          <div><p className="eyebrow">All active bills</p><h2>Care ledger</h2></div>
          <button className="quiet-link" type="button" onClick={() => setShowCreate(true)}>New bill <FilePlus2 size={16} /></button>
        </div>
        <div className="bill-table-card">
          <div className="bill-table-head"><span>Bill / patient</span><span>Status</span><span>Progress</span><span>Due</span><span /></div>
          {bills.map((b) => (
            <button
              className={`bill-table-row ${b.id === bill?.id ? "selected" : ""}`}
              type="button"
              key={b.id}
              onClick={() => setActiveBill(b)}
            >
              <span><strong>{b.public_bill_id}</strong><small>{b.patient_name}</small></span>
              <span className={`tiny-status ${b.status.toLowerCase()}`}>{statusCopy(b.status)}</span>
              <span><strong>{formatMoney(b.amount_paid_minor)}</strong><small>of {formatMoney(b.amount_minor)}</small></span>
              <span>{formatDate(b.due_date)}</span>
              <ChevronRight size={18} />
            </button>
          ))}
          {bills.length === 0 && (
            <div className="bill-table-row">
              <span><strong>No bills yet</strong><small>Create your first verified bill to get started.</small></span>
            </div>
          )}
        </div>
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <section className="create-bill-panel" role="dialog" aria-modal="true" aria-labelledby="new-bill-title">
            <button className="close-button" type="button" onClick={() => setShowCreate(false)} aria-label="Close">
              <X size={20} />
            </button>
            <div className="verified-kicker"><FilePlus2 size={15} /> Provider action</div>
            <h2 id="new-bill-title">Create a verified bill</h2>
            <p>Brivia will issue a unique Bill ID and a share-ready payment link.</p>
            <form onSubmit={submitBill} className="create-bill-form">
              <label>Patient name
                <input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="e.g. Chidinma Okeke" autoFocus />
              </label>
              <label>Payment description
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keep clinical detail minimal" />
              </label>
              <div className="form-two-col">
                <label>Amount (NGN)
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="185,000" />
                </label>
                <label>Due date
                  <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
                </label>
              </div>
              <button className="primary-button full" type="submit">Issue bill and create link <ArrowUpRight size={17} /></button>
            </form>
          </section>
        </div>
      )}
    </BriviaAppShell>
  );
}
