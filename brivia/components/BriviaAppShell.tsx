/**
 * Brivia Living Ledger style: forest contour rail, warm paper surfaces, icon-led care-finance navigation.
 */
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  ClipboardPlus,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Settings,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const markUrl = "/manus-storage/brivia-mark_49f27a3d.png";

const navItems = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Create bill", href: "/provider/create", icon: ClipboardPlus },
  { label: "Patient view", href: "/patient", icon: UsersRound },
  { label: "Bills", href: "/", icon: FileText },
];

export function BriviaMark({ withName = true, compact = false }: { withName?: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex items-center", compact ? "gap-0" : "gap-3")}>
      <img src={markUrl} alt="Brivia" className={cn("object-contain", compact ? "h-9 w-9" : "h-11 w-11")} />
      {withName && (
        <div className="leading-none">
          <span className="brand-word">brivia</span>
          <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#6a8077]">care coordination</span>
        </div>
      )}
    </div>
  );
}

export function BriviaAppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-[#f4f6ef] text-[#163b30]">
      <header className="mobile-topbar">
        <BriviaMark />
        <button className="icon-button" type="button" aria-label="View notifications">
          <Bell size={19} />
          <span className="notification-ping" />
        </button>
      </header>

      <aside className="contour-rail" aria-label="Main navigation">
        <div className="flex flex-col items-center gap-7">
          <Link href="/" aria-label="Brivia provider dashboard">
            <BriviaMark withName={false} compact />
          </Link>
          <div className="rail-line" />
          <nav className="flex flex-col items-center gap-3" aria-label="Workspace routes">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-label={item.label}
                  className={cn("rail-link", isActive && "rail-link-active")}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button className="rail-link" type="button" aria-label="Workspace settings">
            <Settings size={20} />
          </button>
          <button className="rail-link" type="button" aria-label="Sign out of demo">
            <LogOut size={20} />
          </button>
          <div className="provider-avatar" title="Dr. Temi Adebayo">TA</div>
        </div>
      </aside>

      <main className="app-main">{children}</main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/" className={cn("mobile-nav-item", location === "/" && "active")}>
          <LayoutDashboard size={19} />
          <span>Home</span>
        </Link>
        <Link href="/provider/create" className={cn("mobile-nav-item create", location === "/provider/create" && "active")}>
          <ClipboardPlus size={19} />
          <span>Bill</span>
        </Link>
        <Link href="/patient" className={cn("mobile-nav-item", location === "/patient" && "active")}>
          <HeartHandshake size={19} />
          <span>Share</span>
        </Link>
      </nav>
    </div>
  );
}
