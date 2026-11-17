"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  CircleDollarSign,
  Loader2,
  LockKeyhole,
  Send,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import {
  CarePayload,
  Quote,
  claim,
  getCare,
  getQuote,
  money,
  shortDate,
  startWalletPayment,
  subscribeTelegram,
} from "@/lib/care";
import { BriviaMark } from "@/components/BriviaAppShell";

const CURRENCY_LABELS: Record<string, string> = {
  NGN: "₦ NGN",
  GBP: "£ GBP",
  USD: "$ USD",
  EUR: "€ EUR",
  KES: "KSh KES",
  GHS: "₵ GHS",
  ZAR: "R ZAR",
};

export default function CareCircle() {
  const params = useParams();
  const shareToken = (params?.token as string) ?? "";

  const [care, setCare] = useState<CarePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [lineId, setLineId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("NGN");
  const [amount, setAmount] = useState("");
  const [contributor, setContributor] = useState("");
  const [wallet, setWallet] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [receiptPath, setReceiptPath] = useState("");
  const [telegramChat, setTelegramChat] = useState("");
  const [telegramNote, setTelegramNote] = useState("");
  const idempotency = useRef(`care-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const currencyReady = useRef(false);

  const bill = care?.bill;

  const refresh = useCallback(async () => {
    if (!shareToken) return;
    try {
      const data = await getCare(shareToken);
      setCare(data);
      setError("");
      // Adopt the bill's currency once, without clobbering a later choice.
      if (!currencyReady.current) {
        setCurrency(data.bill.currency);
        currencyReady.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this bill.");
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live circle: poll while the page is open. Cheap, and a demo does not need sockets.
  useEffect(() => {
    if (!shareToken) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh, shareToken]);

  const amountMinor = useMemo(() => {
    const parsed = Math.round(Number(amount.replace(/,/g, "")) * 100);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [amount]);

  useEffect(() => {
    if (!shareToken || !bill || amountMinor <= 0) {
      setQuote(null);
      return;
    }
    let active = true;
    setQuoteBusy(true);
    const timer = setTimeout(async () => {
      try {
        const result = await getQuote(shareToken, {
          amount_minor: amountMinor,
          currency,
          line_id: lineId,
          sender_wallet_url: wallet.trim() || undefined,
        });
        if (active) setQuote(result);
      } catch {
        if (active) setQuote(null);
      } finally {
        if (active) setQuoteBusy(false);
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [amountMinor, bill, currency, lineId, shareToken, wallet]);

  const billCurrency = bill?.currency ?? "NGN";

  /** What the bill receives, in bill currency, for the amount typed. */
  const receiveMinor = useMemo(() => {
    if (!bill) return 0;
    if (currency === billCurrency) return amountMinor;
    return quote?.receive_minor ?? 0;
  }, [amountMinor, bill, billCurrency, currency, quote]);

  const selectedLine = bill?.lines.find((line) => line.id === lineId) ?? null;
  const funded = bill?.status === "PAID" || (bill?.remaining_balance_minor ?? 1) <= 0;

  function pickLine(id: string, remaining: number) {
    setLineId(id === lineId ? null : id);
    setCurrency(billCurrency);
    setAmount(remaining > 0 ? (remaining / 100).toString() : "");
  }

  async function payMock(event: FormEvent) {
    event.preventDefault();
    if (!bill || receiveMinor <= 0) return;
    setPaying(true);
    setError("");
    try {
      const result = await claim(shareToken, {
        amount_minor: receiveMinor,
        contributor_name: contributor.trim() || "Anonymous",
        idempotency_key: idempotency.current,
        line_id: lineId,
      });
      setReceiptPath(result.receipt_path);
      setAmount("");
      idempotency.current = `care-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPaying(false);
    }
  }

  async function payWithWallet() {
    if (!bill || receiveMinor <= 0) return;
    if (!wallet.trim()) {
      setError("Add your wallet address first, or use demo payment.");
      return;
    }
    setPaying(true);
    setError("");
    try {
      const result = await startWalletPayment(shareToken, {
        amount_minor: receiveMinor,
        contributor_name: contributor.trim() || "Anonymous",
        sender_wallet_url: wallet.trim(),
        line_id: lineId,
      });
      // Same tab: the wallet redirects back to the existing callback page.
      window.location.href = result.redirect_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open your wallet.");
      setPaying(false);
    }
  }

  async function followBill() {
    setTelegramNote("Saving…");
    try {
      const result = await subscribeTelegram(shareToken, {
        chat_id: telegramChat.trim() || undefined,
      });
      setTelegramNote(
        result.telegram.configured
          ? "Subscribed. Updates will arrive in Telegram."
          : "Subscription saved. Messages are queued until a Telegram bot is connected."
      );
    } catch (err) {
      setTelegramNote(err instanceof Error ? err.message : "Could not subscribe.");
    }
  }

  if (loading) {
    return (
      <main className="care-page">
        <div className="care-loading">
          <Loader2 className="animate-spin-slow" size={30} />
          <p>Loading the care circle…</p>
        </div>
      </main>
    );
  }

  if (error && !bill) {
    return (
      <main className="care-page">
        <div className="care-loading">
          <ShieldAlert size={30} />
          <h1>This link isn&apos;t available</h1>
          <p>{error}</p>
          <Link className="care-link" href="/">
            Back to Brivia
          </Link>
        </div>
      </main>
    );
  }

  if (!bill) return null;

  const progress = bill.amount_minor > 0
    ? Math.min(100, Math.round((bill.amount_paid_minor / bill.amount_minor) * 100))
    : 0;

  return (
    <main className="care-page">
      <header className="care-header">
        <Link href="/" className="care-brand" aria-label="Brivia home">
          <BriviaMark />
          <span>Brivia</span>
        </Link>
        <span className="care-secure">
          <LockKeyhole size={14} /> Care Circle
        </span>
      </header>

      <div className="care-grid">
        {/* Bill + lines ------------------------------------------------ */}
        <section className="care-main">
          <p className="care-kicker">Verified care bill</p>
          <h1>{bill.description}</h1>
          <p className="care-provider">
            {bill.facility_name} · {bill.provider_name} · due {shortDate(bill.due_date)}
          </p>

          <div className={`care-seal ${bill.verified ? "is-verified" : "is-unverified"}`}>
            {bill.verified ? <BadgeCheck size={18} /> : <ShieldAlert size={18} />}
            <div>
              <strong>{bill.verified ? "Seal verified" : "Not sealed"}</strong>
              <span>{bill.verify_note ?? "Ask the provider to seal this bill."}</span>
            </div>
          </div>

          <div className="care-progress-block">
            <div className="care-progress-meta">
              <span>{money(bill.amount_paid_minor, billCurrency)} raised</span>
              <strong>{money(bill.remaining_balance_minor, billCurrency)} still needed</strong>
            </div>
            <div className="care-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="care-bill-id">{bill.public_bill_id}</div>
          </div>

          <h2 className="care-section-title">
            <CircleDollarSign size={18} /> What this bill covers
          </h2>

          {bill.lines.length === 0 ? (
            <p className="care-muted">
              This bill isn&apos;t itemised yet — your contribution still goes to the bill as a whole.
            </p>
          ) : (
            <ul className="care-lines">
              {bill.lines.map((line) => {
                const covered = line.amount_minor > 0
                  ? Math.min(100, Math.round((line.funded_minor / line.amount_minor) * 100))
                  : 0;
                const settled = line.remaining_minor <= 0;
                return (
                  <li key={line.id} className={`care-line ${lineId === line.id ? "is-selected" : ""}`}>
                    <div className="care-line-head">
                      <strong>{line.label}</strong>
                      <span>{money(line.amount_minor, billCurrency)}</span>
                    </div>
                    <div className="care-line-bar">
                      <span style={{ width: `${covered}%` }} />
                    </div>
                    <div className="care-line-foot">
                      <span>
                        {settled
                          ? "Fully covered"
                          : `${money(line.remaining_minor, billCurrency)} left`}
                      </span>
                      <button
                        type="button"
                        className="care-claim"
                        disabled={settled || funded}
                        onClick={() => pickLine(line.id, line.remaining_minor)}
                      >
                        {lineId === line.id ? "Selected" : settled ? "Covered" : "Fund this"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="care-circle" aria-label="Recent contributors">
            <h2 className="care-section-title">The circle</h2>
            {care?.circle.length === 0 ? (
              <p className="care-muted">
                No contributions yet. {bill.lines.length > 0 ? "Pick a line to be the first." : "Be the first to give."}
              </p>
            ) : (
              <ul>
                {care?.circle.map((entry, index) => (
                  <li key={`${entry.created_at}-${index}`}>
                    <span className="care-avatar" aria-hidden>{entry.initials}</span>
                    <div>
                      <strong>{entry.contributor_name}</strong>
                      <span>
                        {entry.line_label ? `${entry.line_label} · ` : ""}
                        {money(entry.amount_minor, billCurrency)}
                      </span>
                    </div>
                    <time>{shortDate(entry.created_at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>

        {/* Payment ------------------------------------------------------ */}
        <aside className="care-pay">
          {receiptPath ? (
            <div className="care-receipt-callout">
              <ShieldCheck size={26} />
              <h2>Thank you</h2>
              <p>Your contribution is recorded and the bill has been updated.</p>
              <Link className="care-primary" href={receiptPath}>
                Open receipt
              </Link>
              <Link className="care-link" href={`/care/${shareToken}`}>
                Give again
              </Link>
            </div>
          ) : (
            <form onSubmit={payMock}>
              <p className="care-kicker">Contribute</p>
              <h2>{selectedLine ? `Fund “${selectedLine.label}”` : "Give toward this bill"}</h2>

              <div className="care-currencies" role="group" aria-label="Display currency">
                {(care?.currencies ?? [billCurrency]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={currency === code ? "is-active" : ""}
                    onClick={() => setCurrency(code)}
                  >
                    {CURRENCY_LABELS[code] ?? code}
                  </button>
                ))}
              </div>

              <label className="care-field">
                Amount{currency !== billCurrency ? ` in ${currency}` : ""}
                <input
                  inputMode="decimal"
                  placeholder={currency === "NGN" ? "25000" : "20"}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={funded}
                />
              </label>

              <label className="care-field">
                Your name (optional)
                <input
                  placeholder="Ada Okafor"
                  value={contributor}
                  onChange={(event) => setContributor(event.target.value)}
                  maxLength={80}
                  disabled={funded}
                />
              </label>

              {amountMinor > 0 && (
                <div className="care-quote">
                  {quoteBusy || !quote ? (
                    <span className="care-quote-loading">
                      <Loader2 size={14} className="animate-spin-slow" /> Checking the rate…
                    </span>
                  ) : (
                    <>
                      <div>
                        <span>You send</span>
                        <strong>{money(quote.debit_minor, quote.currency)}</strong>
                      </div>
                      <div>
                        <span>Bill receives</span>
                        <strong>{money(quote.receive_minor, quote.bill_currency)}</strong>
                      </div>
                      <p>
                        {quote.source === "ilp" ? "Live ILP quote" : "Indicative rate"} · fee{" "}
                        {money(quote.fee_minor, quote.bill_currency)} · net{" "}
                        {money(quote.net_minor, quote.bill_currency)}
                      </p>
                      <small>{quote.note}</small>
                    </>
                  )}
                </div>
              )}

              {error && <p className="care-error" role="alert">{error}</p>}

              {funded ? (
                <p className="care-funded">This bill is fully funded. Nothing left to give.</p>
              ) : (
                <>
                  <button className="care-primary" type="submit" disabled={paying || receiveMinor <= 0}>
                    {paying ? (
                      <>
                        <span className="button-spinner" /> Recording…
                      </>
                    ) : (
                      <>Pay {receiveMinor > 0 ? money(receiveMinor, billCurrency) : ""}</>
                    )}
                  </button>
                  <p className="care-demo-note">
                    Demo settlement — no real money moves. Use the wallet option for a live
                    Interledger payment.
                  </p>

                  <details className="care-wallet">
                    <summary>
                      <Wallet size={15} /> Pay from my wallet
                    </summary>
                    <label className="care-field">
                      Wallet address
                      <input
                        placeholder="https://ilp.interledger-test.dev/your-wallet"
                        value={wallet}
                        onChange={(event) => setWallet(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="care-secondary"
                      onClick={payWithWallet}
                      disabled={paying || receiveMinor <= 0 || !wallet.trim()}
                    >
                      Continue in wallet
                    </button>
                    <small>
                      You approve the exact amount in your own wallet. The bill updates when the
                      payment settles.
                    </small>
                  </details>
                </>
              )}
            </form>
          )}

          <div className="care-telegram">
            <h3>
              <Send size={15} /> Telegram updates
            </h3>
            <p>{care?.telegram.message}</p>
            {care?.telegram.configured && care.telegram.bot_username ? (
              <a
                className="care-link"
                href={`https://t.me/${care.telegram.bot_username}?start=${bill.public_bill_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open @{care.telegram.bot_username}
              </a>
            ) : null}
            <label className="care-field">
              Telegram chat ID (optional)
              <input
                placeholder="123456789"
                value={telegramChat}
                onChange={(event) => setTelegramChat(event.target.value)}
              />
            </label>
            <button type="button" className="care-ghost" onClick={followBill}>
              Follow this bill
            </button>
            {telegramNote && <small>{telegramNote}</small>}
          </div>
        </aside>
      </div>
    </main>
  );
}
