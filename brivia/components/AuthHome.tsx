/**
 * Brivia Auth-Aware Home
 *
 * If the user has a valid token, redirect to their dashboard.
 * Otherwise show the marketing landing page.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, type User } from "@/lib/api";
import LandingPage from "@/components/LandingPage";

export default function AuthHome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMe()
      .then((user: User) => {
        // Redirect authenticated users to their dashboard
        if (user.role === "provider") {
          router.replace("/provider/create");
        } else {
          router.replace("/patient");
        }
      })
      .catch(() => {
        // Not authenticated — show landing page
        setChecking(false);
      });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#fff8f5] flex items-center justify-center">
        <p className="text-[#5b6478]">Loading…</p>
      </div>
    );
  }

  return <LandingPage />;
}
