/**
 * Brivia Marketing Landing Page
 *
 * Public-facing page with hero, features, pricing, and CTA.
 * Redirects to /auth for login/register.
 */
"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Globe,
  HeartHandshake,
  Lock,
  QrCode,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { BriviaMark } from "@/components/BriviaAppShell";

const features = [
  {
    icon: ShieldCheck,
    title: "Verified bills",
    description:
      "Every bill gets a unique ID and a traceable payment link. No ambiguous contributions — every naira is accounted for.",
  },
  {
    icon: Wallet,
    title: "Open Payments",
    description:
      "Wallet-to-wallet settlement via Interledger. No middleman holding your funds. Transparent, instant, borderless.",
  },
  {
    icon: QrCode,
    title: "Share-ready links",
    description:
      "Generate a QR code or secure link for any bill. Supporters pay in seconds — no app download required.",
  },
  {
    icon: Globe,
    title: "Works everywhere",
    description:
      "Patients share once, supporters pay from anywhere. Mobile, desktop, any Open Payments-compatible wallet.",
  },
  {
    icon: Lock,
    title: "Private by design",
    description:
      "Supporters see only the bill information they need. No unnecessary data exposure. Tokens are server-issued and expirable.",
  },
  {
    icon: Zap,
    title: "Real-time tracking",
    description:
      "Providers see contributions as they arrive. Progress bars update instantly. No more chasing payments.",
  },
];

const steps = [
  {
    num: "01",
    title: "Provider creates a bill",
    description: "Enter patient details, amount, and due date. Brivia issues a verified Bill ID.",
  },
  {
    num: "02",
    title: "Share the payment link",
    description: "Send the QR code or link via WhatsApp, SMS, or print it. One link works for all supporters.",
  },
  {
    num: "03",
    title: "Supporters contribute",
    description: "They see the verified bill, enter an amount, and pay from their wallet. No account needed.",
  },
  {
    num: "04",
    title: "Funds settle directly",
    description: "Payments arrive in the provider's wallet via Interledger. The bill updates in real time.",
  },
];

const pricingTiers = [
  {
    name: "Provider",
    price: "Free",
    description: "Create bills, share links, track contributions",
    features: [
      "Unlimited bill creation",
      "QR code & share links",
      "Real-time contribution tracking",
      "Payment history & receipts",
      "Patient management",
    ],
    cta: "Start for free",
    highlighted: true,
  },
  {
    name: "Supporter",
    price: "Free",
    description: "Pay from any Open Payments wallet",
    features: [
      "No account required",
      "Pay from your wallet",
      "Transparent 2% fee",
      "Instant settlement",
      "Payment receipt",
    ],
    cta: "How it works",
    highlighted: false,
  },
];

const testimonials = [
  {
    quote: "Brivia made it easy to coordinate my mother's surgery costs across our family. Everyone could see exactly where the money went.",
    name: "Adaeze O.",
    role: "Patient",
  },
  {
    quote: "As a clinic, we waste hours chasing payments. Brivia gives us a single source of truth for every bill.",
    name: "Dr. Femi A.",
    role: "Healthcare Provider",
  },
  {
    quote: "I contributed to a friend's bill and got a receipt instantly. No bank transfers, no stress.",
    name: "Chidi N.",
    role: "Supporter",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f4f6ef] text-[#163b30]">
      {/* Header */}
      <header className="public-header">
        <BriviaMark />
        <div className="flex items-center gap-3">
          <Link href="/auth" className="outline-button" style={{ padding: "0 16px", minHeight: "40px", fontSize: ".82rem" }}>
            Sign in
          </Link>
          <Link href="/auth" className="primary-button" style={{ padding: "0 16px", minHeight: "40px", fontSize: ".82rem" }}>
            Get started <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ width: "min(1220px, calc(100% - 48px))", margin: "0 auto", padding: "80px 0 60px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, background: "#e7f2dc", color: "#315e46", fontSize: ".76rem", fontWeight: 800, marginBottom: 28 }}>
          <HeartHandshake size={15} /> Healthcare payments, reimagined
        </div>
        <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.02, letterSpacing: "-.08em", fontWeight: 900, maxWidth: 800, margin: "0 auto" }}>
          Care coordination
          <br />
          <span style={{ color: "#0e5f4d" }}>without the friction.</span>
        </h1>
        <p style={{ maxWidth: 560, margin: "24px auto 0", color: "#6d8278", fontSize: "1.1rem", lineHeight: 1.6 }}>
          Brivia connects patients, providers, and supporters with transparent,
          verified healthcare bills. Every contribution is tracked. Every naira is accounted for.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 36 }}>
          <Link href="/auth" className="primary-button" style={{ padding: "0 28px", minHeight: "52px", fontSize: ".9rem" }}>
            Create your first bill <ArrowRight size={18} />
          </Link>
          <a href="#how-it-works" className="outline-button" style={{ padding: "0 24px", minHeight: "52px", fontSize: ".9rem" }}>
            See how it works
          </a>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", justifyContent: "center", gap: 60, marginTop: 64, paddingTop: 32, borderTop: "1px solid #dde8df" }}>
          <div>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: "#0e5f4d", letterSpacing: "-.06em" }}>₦0</div>
            <div style={{ fontSize: ".76rem", color: "#81948b", fontWeight: 700, marginTop: 4 }}>Platform fee for providers</div>
          </div>
          <div>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: "#0e5f4d", letterSpacing: "-.06em" }}>2%</div>
            <div style={{ fontSize: ".76rem", color: "#81948b", fontWeight: 700, marginTop: 4 }}>Transparent supporter fee</div>
          </div>
          <div>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: "#0e5f4d", letterSpacing: "-.06em" }}>&lt;30s</div>
            <div style={{ fontSize: ".76rem", color: "#81948b", fontWeight: 700, marginTop: 4 }}>Average payment time</div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={{ width: "min(1220px, calc(100% - 48px))", margin: "0 auto", padding: "80px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p className="eyebrow">How it works</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-.065em", fontWeight: 900, marginTop: 8 }}>
            Four steps to coordinated care.
          </h2>
        </div>
        <div className="landing-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {steps.map((step) => (
            <div key={step.num} style={{ padding: 28, borderRadius: 22, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#c7dfc7", letterSpacing: "-.06em" }}>{step.num}</div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-.04em", marginTop: 12 }}>{step.title}</h3>
              <p style={{ fontSize: ".84rem", color: "#6d8278", lineHeight: 1.55, marginTop: 8 }}>{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ width: "min(1220px, calc(100% - 48px))", margin: "0 auto", padding: "40px 0 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p className="eyebrow">Features</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-.065em", fontWeight: 900, marginTop: 8 }}>
            Built for trust.
          </h2>
          <p style={{ maxWidth: 480, margin: "12px auto 0", color: "#6d8278", fontSize: ".92rem", lineHeight: 1.55 }}>
            Every feature is designed to make healthcare payments transparent, fast, and secure.
          </p>
        </div>
        <div className="landing-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {features.map((f) => (
            <div key={f.title} style={{ padding: 26, borderRadius: 22, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)", transition: "transform 160ms ease, box-shadow 160ms ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(14,95,77,.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,.04)"; }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 14, background: "#e7f2dc", display: "grid", placeItems: "center", marginBottom: 16 }}>
                <f.icon size={20} color="#0e5f4d" />
              </div>
              <h3 style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: "-.04em" }}>{f.title}</h3>
              <p style={{ fontSize: ".82rem", color: "#6d8278", lineHeight: 1.55, marginTop: 8 }}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ background: "#0a3e33", padding: "80px 0" }}>
        <div style={{ width: "min(1220px, calc(100% - 48px))", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p className="eyebrow" style={{ color: "#8ece6a" }}>Pricing</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-.065em", fontWeight: 900, color: "#fff", marginTop: 8 }}>
              Simple, transparent pricing.
            </h2>
            <p style={{ maxWidth: 480, margin: "12px auto 0", color: "#8fbfa9", fontSize: ".92rem", lineHeight: 1.55 }}>
              No hidden fees. No monthly subscriptions. You only pay when supporters contribute.
            </p>
          </div>
          <div className="landing-pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24, maxWidth: 700, margin: "0 auto" }}>
            {pricingTiers.map((tier) => (
              <div key={tier.name} style={{
                padding: 32, borderRadius: 24, border: tier.highlighted ? "2px solid #8ece6a" : "1px solid rgba(255,255,255,.12)",
                background: tier.highlighted ? "rgba(142,206,106,.08)" : "rgba(255,255,255,.04)",
              }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>{tier.name}</h3>
                <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#e4f19a", letterSpacing: "-.06em", marginTop: 8 }}>{tier.price}</div>
                <p style={{ fontSize: ".82rem", color: "#8fbfa9", marginTop: 8, marginBottom: 20 }}>{tier.description}</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {tier.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: ".82rem", color: "#c7e4d5" }}>
                      <Check size={16} color="#8ece6a" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/auth" className={tier.highlighted ? "primary-button" : "outline-button"}
                  style={{
                    display: "inline-flex", marginTop: 24, width: "100%", justifyContent: "center",
                    ...(tier.highlighted ? { background: "#e4f19a", color: "#0a3e33", borderColor: "#e4f19a" } : { color: "#c7e4d5", borderColor: "rgba(255,255,255,.2)" }),
                  }}>
                  {tier.cta} <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ width: "min(1220px, calc(100% - 48px))", margin: "0 auto", padding: "80px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p className="eyebrow">Trusted by</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-.065em", fontWeight: 900, marginTop: 8 }}>
            Patients, providers, supporters.
          </h2>
        </div>
        <div className="landing-testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {testimonials.map((t) => (
            <div key={t.name} style={{ padding: 26, borderRadius: 22, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
              <p style={{ fontSize: ".88rem", color: "#3b6655", lineHeight: 1.6, fontStyle: "italic", marginBottom: 20 }}>&ldquo;{t.quote}&rdquo;</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "#e7f2dc", display: "grid", placeItems: "center", fontSize: ".72rem", fontWeight: 800, color: "#0e5f4d" }}>
                  {t.name.split(" ").map((w) => w[0]).join("")}
                </div>
                <div>
                  <div style={{ fontSize: ".82rem", fontWeight: 800 }}>{t.name}</div>
                  <div style={{ fontSize: ".72rem", color: "#81948b" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ width: "min(1220px, calc(100% - 48px))", margin: "0 auto", padding: "40px 0 100px" }}>
        <div style={{
          padding: "48px 40px", borderRadius: 28, background: "#0e5f4d", textAlign: "center",
          boxShadow: "0 18px 40px rgba(14,95,77,.18)",
        }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", letterSpacing: "-.065em", fontWeight: 900, color: "#fff" }}>
            Start coordinating care today.
          </h2>
          <p style={{ maxWidth: 440, margin: "12px auto 0", color: "#b9ddca", fontSize: ".92rem", lineHeight: 1.55 }}>
            Create your first verified bill in under a minute. No credit card required.
          </p>
          <Link href="/auth" className="primary-button" style={{
            display: "inline-flex", marginTop: 28, padding: "0 28px", minHeight: "52px", fontSize: ".9rem",
            background: "#e4f19a", color: "#0a3e33", borderColor: "#e4f19a",
          }}>
            Get started free <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #dde8df", padding: "28px 0" }}>
        <div style={{ width: "min(1220px, calc(100% - 48px))", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BriviaMark withName={false} compact />
          <p style={{ fontSize: ".74rem", color: "#81948b" }}>
            &copy; {new Date().getFullYear()} Brivia. Powered by Open Payments / Interledger.
          </p>
        </div>
      </footer>
    </div>
  );
}
