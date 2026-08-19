/**
 * Brivia Living Ledger style: patient-centered share board, warm coordination cues, forest-green verified state.
 */
import { useState } from "react";
import { Link } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ExternalLink, HeartHandshake, MessageCircleMore, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BriviaAppShell } from "@/components/BriviaAppShell";
import { useBriviaDemo } from "@/contexts/BriviaDemoContext";
import { billProgress, formatDate, formatMoney, remainingMinor } from "@/lib/brivia-demo";

const walletImage = "/manus-storage/brivia-wallet-object_b634a0f0.jpg";

export default function PatientDashboard() {
  const { activeBill, getShareUrl } = useBriviaDemo();
  const [copied, setCopied] = useState(false);
  const shareUrl = getShareUrl(activeBill);
  const progress = billProgress(activeBill);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Private share link copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not access your clipboard. Please copy the link shown below.");
    }
  };

  return (
    <BriviaAppShell>
      <div className="workspace-header patient-heading">
        <div><p className="eyebrow">Patient view <span className="live-dot" /> shared securely</p><h1>Your care has a circle.</h1><p className="header-subtitle">See the live balance once, then share a protected contribution link with people you trust.</p></div>
        <div className="demo-chip"><Sparkles size={14} /> Demo payment mode</div>
      </div>

      <section className="patient-grid">
        <article className="patient-bill-card">
          <div className="patient-card-top"><div><div className="verified-kicker"><ShieldCheck size={15} /> Verified for sharing</div><p className="bill-id">{activeBill.publicBillId}</p></div><div className="status-orb"><HeartHandshake size={25} /></div></div>
          <div className="patient-bill-title"><p>From {activeBill.facilityName}</p><h2>{activeBill.description}</h2><span>Due {formatDate(activeBill.dueDate)}</span></div>
          <div className="patient-amount-row"><div><small>Contributions received</small><strong>{formatMoney(activeBill.amountPaidMinor)}</strong></div><div><small>Still needed</small><strong>{formatMoney(remainingMinor(activeBill))}</strong></div></div>
          <div className="progress-stack"><div className="progress-meta"><span>Your care balance</span><strong>{progress}% coordinated</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div></div>
        </article>

        <article className="wallet-visual-card"><img src={walletImage} alt="Green Brivia wallet representing shared contributions" /><div className="wallet-caption"><p className="eyebrow">Health wallet</p><h3>Contributions stay tied to your bill.</h3><p>One shared balance, visible to you and your provider.</p></div></article>

        <article className="patient-share-card">
          <div className="share-card-intro"><div className="soft-icon lime"><MessageCircleMore size={20} /></div><div><p className="eyebrow">Make it easy to help</p><h2>Share this bill privately.</h2><p>Supporters see only the verified payment information they need.</p></div></div>
          <div className="share-card-body"><div className="patient-qr"><QRCodeSVG value={shareUrl} size={154} bgColor="#ffffff" fgColor="#0e5f4d" level="Q" includeMargin /></div><div className="share-link-block"><label>Secure contribution link</label><div className="share-url">{shareUrl.replace(/^https?:\/\//, "")}</div><button className="primary-button" type="button" onClick={share}>{copied ? <><Check size={17} /> Copied</> : <><Copy size={17} /> Copy secure link</>}</button><Link className="outline-button open-link" href={`/pay/${activeBill.shareToken}`}>Open payment page <ExternalLink size={16} /></Link></div></div>
          <div className="share-safety"><ShieldCheck size={16} /><span>This demo link shows a limited bill view. In production, tokens must be server-issued, expirable, and revocable.</span></div>
        </article>

        <article className="contributor-wall"><div className="card-heading"><div><p className="eyebrow">Shared support</p><h3>People who contributed</h3></div><span className="tiny-count">{activeBill.payments.length}</span></div><div className="contributor-grid">{activeBill.payments.map((payment) => <div className="contributor-tile" key={payment.id}><div className="contributor-avatar alt">{payment.contributorName.slice(0, 1)}</div><div><strong>{payment.contributorName}</strong><span>{formatMoney(payment.amountMinor)}</span></div><Check size={16} className="tile-check" /></div>)}</div></article>
      </section>
    </BriviaAppShell>
  );
}
