"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { Bill, getBill } from "@/lib/api";
import {
  BillLine,
  Reconciliation,
  VerifyResult,
  downloadReconciliationCsv,
  flushNotifications,
  getLines,
  getReconciliation,
  money,
  setLines,
  shortDate,
  signBill,
  verifyBill,
} from "@/lib/care";
import { BriviaMark } from "@/components/BriviaAppShell";

interface DraftLine {
  label: string;
  amount: string;
}

function toMinor(value: string) {
  const parsed = Math.round(Number(value.replace(/,/g, "")) * 100);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function BillStudio() {
  const params = useParams();
  const billId = (params?.id as string) ?? "";

  const [bill, setBill] = useState<Bill | null>(null);
  const [lines, setLineState] = useState<BillLine[]>([]);
  const [draft, setDraft] = useState<DraftLine[]>([{ label: "", amount: "" }]);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [seal, setSeal] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    try {
      const [billData, lineData, reconData, sealData] = await Promise.all([
        getBill(billId),
        getLines(billId),
        getReconciliation(billId),
        verifyBill(billId),
      ]);
      setBill(billData);
      setLineState(lineData);
      setRecon(reconData);
      setSeal(sealData);
      if (lineData.length > 0) {
        setDraft(lineData.map((line) => ({ label: line.label, amount: (line.amount_minor / 100).toString() })));
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this bill.");
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useEffect(() => {
    load();
  }, [load]);

  const currency = bill?.currency ?? "NGN";
  const draftTotal = draft.reduce((sum, line) => sum + toMinor(line.amount), 0);
  const canItemise = (bill?.amount_paid_minor ?? 0) === 0;

  async function saveLines() {
    setSaving(true);
    setNote("");
    setError("");
    try {
      const payload = draft
        .filter((line) => line.label.trim() && toMinor(line.amount) > 0)
        .map((line) => ({ label: line.label.trim(), amount_minor: toMinor(line.amount) }));
      const saved = await setLines(billId, payload);
      setLineState(saved);
      setNote("Line items saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save line items.");
    } finally {
      setSaving(false);
    }
  }

  async function sealBill() {
    setSaving(true);
    setError("");
    try {
      const signed = await signBill(billId);
      setSeal(signed);
      setNote("Bill sealed. Contributors can now verify it.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seal this bill.");
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    try {
      await downloadReconciliationCsv(billId, `${bill?.public_bill_id ?? "bill"}-reconciliation.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function flush() {
    setNote("");
    try {
      const result = await flushNotifications();
      setNote(
        result.configured
          ? `Delivered ${result.sent}, ${result.pending} still queued.`
          : `${result.pending} message(s) queued — add a Telegram bot token to deliver them.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not flush notifications.");
    }
  }

  if (loading) {
    return (
      <main className="care-page">
        <div className="care-loading">
          <Loader2 className="animate-spin-slow" size={30} />
          <p>Loading bill studio…</p>
        </div>
      </main>
    );
  }

  if (!bill) {
    return (
      <main className="care-page">
        <div className="care-loading">
          <ShieldAlert size={30} />
          <h1>Bill not available</h1>
          <p>{error || "Sign in as the provider who created this bill."}</p>
          <Link className="care-link" href="/">Back to Brivia</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="care-page">
      <header className="care-header">
        <Link href="/" className="care-brand" aria-label="Brivia home">
          <BriviaMark />
          <span>Brivia</span>
        </Link>
        <span className="care-secure">Bill studio</span>
      </header>

      <div className="studio-wrap">
        <section className="studio-head">
          <p className="care-kicker">{bill.public_bill_id}</p>
          <h1>{bill.description}</h1>
          <p className="care-provider">
            {bill.patient_name} · {money(bill.amount_minor, currency)} · due {shortDate(bill.due_date)}
          </p>

          <div className={`care-seal ${seal?.verified ? "is-verified" : "is-unverified"}`}>
            {seal?.verified ? <BadgeCheck size={18} /> : <ShieldAlert size={18} />}
            <div>
              <strong>{seal?.verified ? "Sealed" : "Not sealed"}</strong>
              <span>{seal?.note ?? "Seal the bill so contributors can detect edits."}</span>
            </div>
            <button type="button" className="care-ghost" onClick={sealBill} disabled={saving}>
              {seal?.verified ? "Re-seal" : "Seal bill"}
            </button>
          </div>
        </section>

        {error && <p className="care-error" role="alert">{error}</p>}
        {note && <p className="studio-note">{note}</p>}

        <div className="studio-grid">
          {/* Itemisation ------------------------------------------------ */}
          <section className="studio-card">
            <h2>Itemise the bill</h2>
            <p className="care-muted">
              Lines must add up to {money(bill.amount_minor, currency)}. Total now:{" "}
              <strong>{money(draftTotal, currency)}</strong>
            </p>

            {!canItemise && (
              <p className="care-error">
                This bill already has contributions, so its lines are locked.
              </p>
            )}

            <ul className="studio-lines">
              {draft.map((line, index) => (
                <li key={index}>
                  <input
                    aria-label={`Line ${index + 1} label`}
                    placeholder="Lab panel"
                    value={line.label}
                    disabled={!canItemise}
                    onChange={(event) => {
                      const next = [...draft];
                      next[index] = { ...next[index], label: event.target.value };
                      setDraft(next);
                    }}
                  />
                  <input
                    aria-label={`Line ${index + 1} amount`}
                    inputMode="decimal"
                    placeholder="18000"
                    value={line.amount}
                    disabled={!canItemise}
                    onChange={(event) => {
                      const next = [...draft];
                      next[index] = { ...next[index], amount: event.target.value };
                      setDraft(next);
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                    disabled={!canItemise || draft.length === 1}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="studio-actions">
              <button
                type="button"
                className="care-ghost"
                onClick={() => setDraft([...draft, { label: "", amount: "" }])}
                disabled={!canItemise}
              >
                <Plus size={15} /> Add line
              </button>
              <button
                type="button"
                className="care-primary"
                onClick={saveLines}
                disabled={!canItemise || saving}
              >
                {saving ? <Loader2 size={16} className="animate-spin-slow" /> : null}
                Save lines
              </button>
            </div>

            {lines.length > 0 && (
              <div className="studio-coverage">
                <h3>Coverage</h3>
                {lines.map((line) => (
                  <div key={line.id} className="studio-coverage-row">
                    <span>{line.label}</span>
                    <span>
                      {money(line.funded_minor, currency)} / {money(line.amount_minor, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Reconciliation -------------------------------------------- */}
          <section className="studio-card">
            <div className="studio-card-head">
              <h2>Reconciliation</h2>
              <div className="studio-actions">
                <button type="button" className="care-ghost" onClick={load}>
                  <RefreshCw size={15} /> Refresh
                </button>
                <button type="button" className="care-ghost" onClick={exportCsv}>
                  <Download size={15} /> CSV
                </button>
              </div>
            </div>

            {recon && (
              <div className="studio-totals">
                <div>
                  <span>Gross</span>
                  <strong>{money(recon.totals.gross_minor, currency)}</strong>
                </div>
                <div>
                  <span>Fees</span>
                  <strong>{money(recon.totals.fee_minor, currency)}</strong>
                </div>
                <div>
                  <span>To provider</span>
                  <strong>{money(recon.totals.net_minor, currency)}</strong>
                </div>
                <div>
                  <span>Settled / pending</span>
                  <strong>
                    {recon.totals.settled_count} / {recon.totals.pending_count}
                  </strong>
                </div>
              </div>
            )}

            {recon && recon.rows.length === 0 ? (
              <p className="care-muted">No contributions yet.</p>
            ) : (
              <div className="studio-table-wrap">
                <table className="studio-table">
                  <thead>
                    <tr>
                      <th>Contributor</th>
                      <th>Line</th>
                      <th>Gross</th>
                      <th>Fee</th>
                      <th>Net</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recon?.rows.map((row) => (
                      <tr key={row.payment_reference}>
                        <td>{row.contributor_name}</td>
                        <td>{row.line_label ?? "—"}</td>
                        <td>{money(row.gross_minor, currency)}</td>
                        <td>{money(row.fee_minor, currency)}</td>
                        <td>{money(row.net_minor, currency)}</td>
                        <td>
                          <span className={`studio-status is-${row.status.toLowerCase()}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button type="button" className="care-ghost" onClick={flush}>
              <Send size={15} /> Deliver queued Telegram updates
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
