"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Lock, User, ArrowLeft } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; userId: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Password form
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { router.replace("/auth/login"); return; }
        setUser(data);
        setLoading(false);
      })
      .catch(() => router.replace("/auth/login"));
  }, [router]);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (next !== confirm) { setPwError("New passwords do not match."); return; }
    if (next.length < 8) { setPwError("Password must be at least 8 characters."); return; }

    setPwStatus("saving");
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });

    if (res.ok) {
      setPwStatus("done");
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      const data = await res.json();
      setPwError(data.error ?? "Something went wrong.");
      setPwStatus("error");
    }
  }

  if (loading) return null;

  return (
    <div style={s.shell}>
      <header style={s.header}>
        <Link href="/" style={s.brand}>
          <NextImage src="/icode-logo.svg" alt="icode" width={30} height={30} />
          <span style={s.brandText}>icode</span>
        </Link>
        <div style={s.headerRight}>
          <Link href="/dashboard" style={s.backLink}>
            <ArrowLeft size={14} />
            Dashboard
          </Link>
        </div>
      </header>

      <main style={s.main}>
        <h1 style={s.pageTitle}>Account Settings</h1>

        {/* Account info card */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <User size={18} color="#2563eb" />
            <span style={s.cardTitle}>Account info</span>
          </div>
          <div style={s.row}>
            <span style={s.label}>Email address</span>
            <span style={s.value}>{user?.email}</span>
          </div>
          <div style={s.row}>
            <span style={s.label}>Account ID</span>
            <code style={s.code}>{user?.userId}</code>
          </div>
        </div>

        {/* Change password card */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <Lock size={18} color="#2563eb" />
            <span style={s.cardTitle}>Change password</span>
          </div>

          <form onSubmit={handlePasswordChange} style={s.form}>
            <label style={s.fieldLabel}>
              Current password
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                style={s.input}
                autoComplete="current-password"
              />
            </label>
            <label style={s.fieldLabel}>
              New password
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                style={s.input}
                autoComplete="new-password"
              />
            </label>
            <label style={s.fieldLabel}>
              Confirm new password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                style={s.input}
                autoComplete="new-password"
              />
            </label>

            {pwError && (
              <div style={s.errorBox}>
                <AlertCircle size={14} />
                {pwError}
              </div>
            )}

            {pwStatus === "done" && (
              <div style={s.successBox}>
                <CheckCircle size={14} />
                Password updated successfully.
              </div>
            )}

            <button type="submit" style={s.submitBtn} disabled={pwStatus === "saving"}>
              {pwStatus === "saving" ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>

        {/* Danger zone */}
        <div style={{ ...s.card, borderColor: "#fee2e2" }}>
          <div style={s.cardHeader}>
            <AlertCircle size={18} color="#dc2626" />
            <span style={{ ...s.cardTitle, color: "#dc2626" }}>Danger zone</span>
          </div>
          <p style={s.dangerText}>
            To delete your account and all your QR codes, contact support. This action is irreversible.
          </p>
        </div>
      </main>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", background: "#f8fafc", fontFamily: "Manrope, sans-serif" },
  header: {
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    padding: "0 32px",
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" },
  brandText: { fontSize: "20px", fontWeight: 700, color: "#1f2f56", fontFamily: "'Space Grotesk', sans-serif" },
  headerRight: { display: "flex", alignItems: "center", gap: "12px" },
  backLink: {
    display: "flex", alignItems: "center", gap: "5px",
    color: "#6b7280", fontSize: "14px", fontWeight: 500, textDecoration: "none",
  },
  main: { maxWidth: "560px", margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: "20px" },
  pageTitle: { fontSize: "24px", fontWeight: 700, color: "#1f2f56", margin: "0 0 4px" },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  cardHeader: { display: "flex", alignItems: "center", gap: "8px" },
  cardTitle: { fontSize: "16px", fontWeight: 700, color: "#1f2f56" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
  label: { fontSize: "13px", color: "#6b7280", fontWeight: 600 },
  value: { fontSize: "14px", color: "#1f2f56", fontWeight: 500 },
  code: { fontSize: "12px", fontFamily: "monospace", background: "#f3f4f6", padding: "3px 8px", borderRadius: "6px", color: "#374151" },
  form: { display: "flex", flexDirection: "column", gap: "14px" },
  fieldLabel: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#374151" },
  input: {
    padding: "10px 12px",
    borderRadius: "9px",
    border: "1.5px solid #d1d5db",
    fontSize: "14px",
    fontFamily: "Manrope, sans-serif",
    outline: "none",
  },
  errorBox: {
    display: "flex", alignItems: "center", gap: "7px",
    background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "9px",
    padding: "10px 14px", color: "#dc2626", fontSize: "13px", fontWeight: 600,
  },
  successBox: {
    display: "flex", alignItems: "center", gap: "7px",
    background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "9px",
    padding: "10px 14px", color: "#15803d", fontSize: "13px", fontWeight: 600,
  },
  submitBtn: {
    padding: "11px 20px", borderRadius: "10px", border: "none",
    background: "#2563eb", color: "#fff", fontWeight: 700,
    fontSize: "14px", cursor: "pointer", fontFamily: "Manrope, sans-serif",
    alignSelf: "flex-start",
  },
  dangerText: { fontSize: "13px", color: "#6b7280", lineHeight: 1.5 },
};
