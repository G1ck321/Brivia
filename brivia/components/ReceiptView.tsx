"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Copy, Loader2, Share2, ShieldAlert } from "lucide-react";

import { Receipt, getReceipt, money, shortDate } from "@/lib/care";
import { BriviaMark } from "@/components/BriviaAppShell";

export default function ReceiptView() {
  const params = useParams();
  const reference = (params?.reference as string) ?? "";

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!reference) return;
    getReceipt(reference)
      .then(setReceipt)
      .catch((err) => setError(err instanceof Error ? err.message : "Receipt not found."));
  }, [reference]);

  async function share() {
    if (!receipt) return;
    const url = window.location.href;
    const text = `${receipt.contributor_name} contributed ${money(
      receipt.net_minor,
      receipt.currency
    )} to ${receipt.bill_public_id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Brivia receipt", text, url });
        return;
      } catch {
        // fall through to copy
      }
    }
    await navigator.clipboard.writeText(`${text} — ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) {
    return (
      <main className="care-page">
        <div className="care-loading">
          <ShieldAlert size={30} />
          <h1>Receipt unavailable</h1>
          <p>{error}</p>
          <Link className="care-link" href="/">Back to Brivia</Link>
        </div>
      </main>
    );
  }

  if (!receipt) {
    return (
      <main className="care-page">
        <div className="care-loading">
          <Loader2 className="animate-spin-slow" size={30} />
          <p>Loading receipt…</p>
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
        <span className="care-secure">Receipt</span>
      </header>

      <div className="receiptx-wrap">
        <article className="receiptx-card">
          <div className="receiptx-check" aria-hidden>
            <Check size={26} />
          </div>
          <p className="care-kicker">Contribution recorded</p>
          <h1>{money(receipt.gross_minor, receipt.currency)}</h1>
          <p className="receiptx-intro">
            {receipt.contributor_name}
            {receipt.line_label ? ` covered ${receipt.line_label}` : " gave"} toward{" "}
            {receipt.description}.
          </p>

          <dl className="receiptx-details">
            <div>
              <dt>Bill</dt>
              <dd>{receipt.bill_public_id}</dd>
            </div>
            <div>
              <dt>Facility</dt>
              <dd>{receipt.facility_name}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{receipt.payment_reference}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{shortDate(receipt.created_at)}</dd>
            </div>
            <div>
              <dt>Platform fee</dt>
              <dd>{money(receipt.fee_minor, receipt.currency)}</dd>
            </div>
            <div>
              <dt>To the bill</dt>
              <dd>{money(receipt.net_minor, receipt.currency)}</dd>
            </div>
          </dl>

          <p className="receiptx-note">
            Status: {receipt.status.toLowerCase()}. Brivia records the fee separately, so this
            receipt always reconciles against the bill.
          </p>

          <div className="receiptx-actions">
            <button type="button" className="care-primary" onClick={share}>
              {copied ? <Copy size={16} /> : <Share2 size={16} />}
              {copied ? "Link copied" : "Share this receipt"}
            </button>
            <Link className="care-link" href="/">Back to Brivia</Link>
          </div>
        </article>
      </div>
    </main>
  );
}
