/**
 * Brivia Living Ledger style: forest contour rail, warm paper surfaces, icon-led care-finance navigation.
 */
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { getMe, type User } from "@/lib/api";

const markUrl = "/logobriv.png";

const navItems = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Create bill", href: "/provider/create", icon: ClipboardPlus },
  { label: "Patient view", href: "/patient", icon: UsersRound },
  { label: "Bills", href: "/", icon: FileText, scrollId: "bills-section" },
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

  const handleNavClick = (item: (typeof navItems)[number]) => {
    if (item.scrollId && pathname === "/") {
      const el = document.getElementById(item.scrollId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  };

  const initials = user ? getInitials(user.name) : "";
  const displayName = user?.name || "";

  return (
    <div className="min-h-screen bg-[#f4f6ef] text-[#163b30]">
      <header className="mobile-topbar">
        <BriviaMark />
        <Tooltip text="Notifications">
          <button className="icon-button" type="button" aria-label="View notifications">
            <Bell size={19} />
            <span className="notification-ping" />
          </button>
        </Tooltip>
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
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Tooltip key={item.label} text={item.label}>
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    className={cn("rail-link", isActive && "rail-link-active")}
                    onClick={() => handleNavClick(item)}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                  </Link>
                </Tooltip>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col items-center gap-3">
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
                localStorage.removeItem("brivia_token");
                localStorage.removeItem("brivia_user");
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
