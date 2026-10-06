/**
 * Brivia app shell: navy contour rail, circular brand mark, icon-led care-finance
 * navigation, and a notifications panel that surfaces real ledger activity.
 */
"use client";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ClipboardPlus,
  Clock3,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  UsersRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getBillPayments,
  getMe,
  getMyBills,
  logout as apiLogout,
  type Bill,
  type Payment,
  type User,
} from "@/lib/api";

const markUrl = "/logomark.png";

const navItems = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Create bill", href: "/provider/create", icon: ClipboardPlus },
  { label: "Patient view", href: "/patient", icon: UsersRound },
  { label: "Care ledger", href: "/provider/create", icon: FileText, scrollId: "bills-section" },
];

function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <div className="tooltip-wrapper">
      {children}
      <span className="tooltip-label">{text}</span>
    </div>
  );
}

export function BriviaMark({ withName = true, compact = false }: { withName?: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex items-center", compact ? "gap-0" : "gap-3")}>
      <span className="brand-mark-link">
        <img src={markUrl} alt="" className="brand-mark" />
      </span>
      {withName && (
        <div className="leading-none">
          <span className="brand-word">BRIVIA</span>
          <span className="brand-tagline">Care Connected. Payment Simplified.</span>
        </div>
      )}
    </div>
  );
}

function formatMoney(minor: number): string {
  return `₦${(minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

interface Notif {
  id: string;
  kind: "payment" | "funded" | "due";
  title: string;
  body: string;
  time: string;
  href: string;
}

function NotificationsBell({ placement }: { placement: "rail" | "topbar" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSignedOut(false);
    (async () => {
      try {
        const bills = await getMyBills();
        const perBill = await Promise.all(
          bills.slice(0, 4).map(async (b: Bill) => {
            try {
              return { bill: b, payments: await getBillPayments(b.id) };
            } catch {
              return { bill: b, payments: [] as Payment[] };
            }
          })
        );
        if (cancelled) return;
        const notifs: Notif[] = [];
        for (const { bill, payments } of perBill) {
          for (const p of payments) {
            if (p.status !== "COMPLETED") continue;
            notifs.push({
              id: p.id,
              kind: "payment",
              title: `${formatMoney(p.amount_minor)} received`,
              body: `${p.contributor_name || "A supporter"} · ${bill.public_bill_id}`,
              time: p.created_at,
              href: `/bills/${bill.id}`,
            });
          }
          if (bill.status === "PAID") {
            notifs.push({
              id: `${bill.id}-funded`,
              kind: "funded",
              title: `${bill.public_bill_id} fully funded`,
              body: `${bill.description} · ${formatMoney(bill.amount_minor)}`,
              time: bill.updated_at,
              href: `/bills/${bill.id}`,
            });
          }
          const days = Math.ceil((new Date(bill.due_date).getTime() - Date.now()) / 86400000);
          if (bill.status !== "PAID" && days >= 0 && days <= 3) {
            notifs.push({
              id: `${bill.id}-due`,
              kind: "due",
              title: `${bill.public_bill_id} due ${days === 0 ? "today" : `in ${days} day${days > 1 ? "s" : ""}`}`,
              body: `${bill.patient_name} · ${formatMoney(bill.remaining_balance_minor)} still needed`,
              time: bill.due_date,
              href: `/bills/${bill.id}`,
            });
          }
        }
        notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setItems(notifs.slice(0, 7));
      } catch {
        if (!cancelled) {
          setItems([]);
          setSignedOut(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const kindIcon = { payment: Wallet, funded: Sparkles, due: Clock3 };

  return (
    <div
      className={cn("tooltip-wrapper notif-wrapper", placement === "rail" ? "notif-rail" : "notif-topbar")}
      ref={wrapRef}
    >
      <button
        className={placement === "rail" ? "rail-link" : "icon-button"}
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} />
        {!open && items.length > 0 && <span className="notification-ping" />}
      </button>
      {!open && <span className="tooltip-label">Notifications</span>}
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {!loading && !signedOut && items.length > 0 && <span>{items.length} recent</span>}
          </div>
          {loading ? (
            <p className="notif-empty">Checking the ledger…</p>
          ) : signedOut ? (
            <p className="notif-empty">Sign in to see contributions and bill updates as they happen.</p>
          ) : items.length === 0 ? (
            <p className="notif-empty">
              No activity yet. Contributions, funding updates, and due-date reminders appear here the moment they
              happen.
            </p>
          ) : (
            <ul className="notif-list">
              {items.map((item) => {
                const Icon = kindIcon[item.kind];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="notif-item"
                      onClick={() => {
                        setOpen(false);
                        router.push(item.href);
                      }}
                    >
                      <span className={cn("notif-icon", item.kind)}>
                        <Icon size={15} />
                      </span>
                      <span className="notif-copy">
                        <strong>{item.title}</strong>
                        <small>{item.body}</small>
                      </span>
                      <time>{timeAgo(item.time)}</time>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function BriviaAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getMe().then(setUser).catch(() => {});
  }, []);

  const scrollToLedger = () => {
    const el = document.getElementById("bills-section");
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  };

  const goToLedger = () => {
    if (scrollToLedger()) return;
    // The ledger lives on the workspace page for the signed-in role.
    const target = user?.role === "patient" ? "/patient" : "/provider/create";
    router.push(target);
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (scrollToLedger() || tries > 50) window.clearInterval(timer);
    }, 100);
  };

  const handleNavClick = (event: ReactMouseEvent, item: (typeof navItems)[number]) => {
    if (!item.scrollId) return;
    event.preventDefault();
    goToLedger();
  };

  const initials = user ? getInitials(user.name) : "";
  const displayName = user?.name || "";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="mobile-topbar">
        <BriviaMark />
        <NotificationsBell placement="topbar" />
      </header>

      <aside className="contour-rail" aria-label="Main navigation">
        <div className="flex flex-col items-center gap-7">
          <Link href="/" aria-label="Brivia home">
            <BriviaMark withName={false} compact />
          </Link>
          <div className="rail-line" />
          <nav className="flex flex-col items-center gap-3" aria-label="Workspace routes">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.scrollId
                ? false
                : item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Tooltip key={item.label} text={item.label}>
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    className={cn("rail-link", isActive && "rail-link-active")}
                    onClick={(event) => handleNavClick(event, item)}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                  </Link>
                </Tooltip>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col items-center gap-3">
          <NotificationsBell placement="rail" />
          <Tooltip text="Settings">
            <Link href="/settings" className="rail-link" aria-label="Workspace settings">
              <Settings size={20} />
            </Link>
          </Tooltip>
          <Tooltip text="Sign out">
            <button
              className="rail-link"
              type="button"
              aria-label="Sign out"
              onClick={() => {
                apiLogout();
                router.push("/");
              }}
            >
              <LogOut size={20} />
            </button>
          </Tooltip>
          <Tooltip text={displayName}>
            <Link href="/settings" className="provider-avatar" aria-label="Account settings">
              {initials}
            </Link>
          </Tooltip>
        </div>
      </aside>

      <main className="app-main">{children}</main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/" className={cn("mobile-nav-item", pathname === "/" && "active")}>
          <LayoutDashboard size={19} />
          <span>Home</span>
        </Link>
        <Link
          href="/provider/create"
          className="mobile-nav-item"
          onClick={(event) => handleNavClick(event, navItems[3])}
        >
          <FileText size={19} />
          <span>Ledger</span>
        </Link>
        <Link href="/provider/create" className={cn("mobile-nav-item create", pathname === "/provider/create" && "active")}>
          <ClipboardPlus size={19} />
          <span>Bill</span>
        </Link>
        <Link href="/patient" className={cn("mobile-nav-item", pathname === "/patient" && "active")}>
          <HeartHandshake size={19} />
          <span>Share</span>
        </Link>
      </nav>
    </div>
  );
}
