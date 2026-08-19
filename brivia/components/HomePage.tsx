/**
 * Brivia Home Page
 * 
 * Landing page with login/register.
 * After auth, redirects to provider or patient dashboard.
 */
"use client";

import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  HeartHandshake,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { BriviaMark } from "@/components/BriviaAppShell";
import { login, register, type User } from "@/lib/api";

export default function HomePage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"provider" | "patient">("provider");
  const [facilityName, setFacilityName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let result: { access_token: string; user: User };
      if (mode === "login") {
        result = await login(email, password);
      } else {
        result = await register({
          email,
          password,
          name,
          role,
          facility_name: role === "provider" ? facilityName : undefined,
        });
      }

      // Redirect based on role
      if (result.user.role === "provider") {
        navigate("/provider/create");
      } else {
        navigate("/patient");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6ef] text-[#163b30]">
      <header className="public-header">
        <BriviaMark />
      </header>

      <main className="public-layout">
        <section className="public-intro">
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
            Healthcare payments,
            <br />
            <span className="text-[#0e5f4d]">coordinated.</span>
          </h1>
          <p className="mt-4 max-w-md text-[#6d8278] leading-relaxed">
            Brivia helps patients, providers, and supporters coordinate
            healthcare costs transparently. Every contribution is recorded
            against a verified bill.
          </p>

          <div className="flex gap-3 mt-8">
            <button
              className="primary-button"
              onClick={() => setMode("register")}
            >
              Get started
            </button>
            <button
              className="outline-button"
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
          </div>
        </section>

        <section className="pay-card">
          <div className="verified-kicker">
            <ShieldCheck size={15} /> {mode === "login" ? "Sign in" : "Create account"}
          </div>

          <form onSubmit={handleSubmit} className="create-bill-form mt-4">
            {mode === "register" && (
              <>
                <label>
                  Full name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Dr. Temi Adeyemi"
                    required
                  />
                </label>
                <label>
                  Role
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "provider" | "patient")}
                    className="w-full min-h-[46px] mt-1 px-3 border border-[#d8e4da] rounded-[13px] bg-[#fcfdfb]"
                  >
                    <option value="provider">Healthcare Provider</option>
                    <option value="patient">Patient</option>
                  </select>
                </label>
                {role === "provider" && (
                  <label>
                    Facility name
                    <input
                      value={facilityName}
                      onChange={(e) => setFacilityName(e.target.value)}
                      placeholder="e.g. Brivia Demo Hospital"
                    />
                  </label>
                )}
              </>
            )}

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
              />
            </label>

            {error && (
              <p className="form-error" role="alert">{error}</p>
            )}

            <button
              className="primary-button full"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="animate-spin" size={17} /> {mode === "login" ? "Signing in…" : "Creating account…"}</>
              ) : (
                <>{mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={17} /></>
              )}
            </button>

            <p className="text-center text-sm text-[#6d8278]">
              {mode === "login" ? (
                <>Don&apos;t have an account?{" "}
                  <button type="button" className="text-[#0e5f4d] font-bold" onClick={() => setMode("register")}>
                    Register
                  </button>
                </>
              ) : (
                <>Already have an account?{" "}
                  <button type="button" className="text-[#0e5f4d] font-bold" onClick={() => setMode("login")}>
                    Sign in
                  </button>
                </>
              )}
            </p>

            {mode === "login" && (
              <div className="form-note">
                <HeartHandshake size={16} />
                <span>
                  <strong>Demo accounts:</strong><br />
                  Provider: provider@brivia.app / password123<br />
                  Patient: patient@brivia.app / password123
                </span>
              </div>
            )}
          </form>
        </section>
      </main>
    </div>
  );
}
