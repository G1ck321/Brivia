/**
 * Brivia Settings Page
 *
 * Allows providers/patients to update their name, facility, and password.
 */
"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  LockKeyhole,
  Save,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { BriviaAppShell } from "@/components/BriviaAppShell";
import { getMe, updateProfile, changePassword, type User as UserType } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    getMe()
      .then((u) => {
        setUser(u);
        setName(u.name);
        setFacilityName(u.facility_name || "");
      })
      .catch(() => {
        toast.error("Could not load your profile");
        router.push("/");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await updateProfile({
        name: name.trim(),
        facility_name: facilityName.trim() || undefined,
      });
      setUser(updated);
      localStorage.setItem("brivia_user", JSON.stringify(updated));
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <BriviaAppShell>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-[#6d8278]">Loading settings…</p>
        </div>
      </BriviaAppShell>
    );
  }

  return (
    <BriviaAppShell>
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
          <p className="header-subtitle">Manage your profile and security.</p>
        </div>
      </div>

      <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Profile Section */}
        <section
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: 28,
            boxShadow: "0 1px 3px rgba(0,0,0,.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "#dcf0e4",
                display: "grid",
                placeItems: "center",
              }}
            >
              <User size={18} color="#0e5f4d" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Profile</h2>
              <p style={{ margin: 0, fontSize: ".78rem", color: "#81948b" }}>
                Update your name and facility
              </p>
            </div>
          </div>

          <form onSubmit={handleProfileSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ fontSize: ".82rem", fontWeight: 600, color: "#4a6b5e" }}>
              Full name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 14px",
                  border: "1px solid #d8e4da",
                  borderRadius: 13,
                  background: "#fcfdfb",
                  fontSize: ".9rem",
                  color: "#163b30",
                }}
              />
            </label>

            {user?.role === "provider" && (
              <label style={{ fontSize: ".82rem", fontWeight: 600, color: "#4a6b5e" }}>
                Facility name
                <input
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  placeholder="e.g. Brivia Clinic"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "12px 14px",
                    border: "1px solid #d8e4da",
                    borderRadius: 13,
                    background: "#fcfdfb",
                    fontSize: ".9rem",
                    color: "#163b30",
                  }}
                />
              </label>
            )}

            <label style={{ fontSize: ".82rem", fontWeight: 600, color: "#4a6b5e" }}>
              Email
              <input
                value={user?.email || ""}
                disabled
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 14px",
                  border: "1px solid #d8e4da",
                  borderRadius: 13,
                  background: "#f0f2ed",
                  fontSize: ".9rem",
                  color: "#81948b",
                  cursor: "not-allowed",
                }}
              />
            </label>

            <label style={{ fontSize: ".82rem", fontWeight: 600, color: "#4a6b5e" }}>
              Role
              <input
                value={user?.role === "provider" ? "Healthcare Provider" : "Patient"}
                disabled
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 14px",
                  border: "1px solid #d8e4da",
                  borderRadius: 13,
                  background: "#f0f2ed",
                  fontSize: ".9rem",
                  color: "#81948b",
                  cursor: "not-allowed",
                }}
              />
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={savingProfile}
              style={{ alignSelf: "flex-start", marginTop: 4 }}
            >
              <Save size={16} />
              {savingProfile ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        {/* Password Section */}
        <section
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: 28,
            boxShadow: "0 1px 3px rgba(0,0,0,.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "#fff8e1",
                display: "grid",
                placeItems: "center",
              }}
            >
              <LockKeyhole size={18} color="#e6a817" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Password</h2>
              <p style={{ margin: 0, fontSize: ".78rem", color: "#81948b" }}>
                Change your account password
              </p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ fontSize: ".82rem", fontWeight: 600, color: "#4a6b5e" }}>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 14px",
                  border: "1px solid #d8e4da",
                  borderRadius: 13,
                  background: "#fcfdfb",
                  fontSize: ".9rem",
                  color: "#163b30",
                }}
              />
            </label>

            <label style={{ fontSize: ".82rem", fontWeight: 600, color: "#4a6b5e" }}>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                minLength={8}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 14px",
                  border: "1px solid #d8e4da",
                  borderRadius: 13,
                  background: "#fcfdfb",
                  fontSize: ".9rem",
                  color: "#163b30",
                }}
              />
            </label>

            <label style={{ fontSize: ".82rem", fontWeight: 600, color: "#4a6b5e" }}>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                minLength={8}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 14px",
                  border: "1px solid #d8e4da",
                  borderRadius: 13,
                  background: "#fcfdfb",
                  fontSize: ".9rem",
                  color: "#163b30",
                }}
              />
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={savingPassword}
              style={{ alignSelf: "flex-start", marginTop: 4, background: "#e6a817", color: "#3d2e00" }}
            >
              <LockKeyhole size={16} />
              {savingPassword ? "Changing…" : "Change password"}
            </button>
          </form>
        </section>

        {/* Danger Zone */}
        <section
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: 28,
            boxShadow: "0 1px 3px rgba(0,0,0,.04)",
            border: "1px solid #f0d0d0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "#fde8e8",
                display: "grid",
                placeItems: "center",
              }}
            >
              <ShieldCheck size={18} color="#c62828" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Session</h2>
              <p style={{ margin: 0, fontSize: ".78rem", color: "#81948b" }}>
                Sign out of your account
              </p>
            </div>
          </div>
          <Link
            href="/"
            onClick={() => {
              localStorage.removeItem("brivia_token");
              localStorage.removeItem("brivia_user");
              toast.success("Signed out");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 12,
              border: "1px solid #f0d0d0",
              background: "#fff",
              color: "#c62828",
              fontWeight: 600,
              fontSize: ".85rem",
              textDecoration: "none",
            }}
          >
            Sign out
          </Link>
        </section>
      </div>
    </BriviaAppShell>
  );
}
