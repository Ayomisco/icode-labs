"use client";

import { useState, FormEvent } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Login failed.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <NextImage src="/icode-logo.svg" alt="icode" width={36} height={36} priority />
          <span style={styles.brandText}>icode</span>
        </div>

        <h1 style={styles.heading}>Welcome back</h1>
        <p style={styles.sub}>Sign in to manage your QR codes</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={styles.footer}>
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" style={styles.link}>Create one</Link>
        </p>
        <p style={styles.footer}>
          <Link href="/" style={styles.link}>← Back to QR Builder</Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #f0f4ff 0%, #e8f5f0 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "Manrope, sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: "20px",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 4px 32px rgba(31,47,86,0.10)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "28px",
  },
  brandText: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#1f2f56",
    fontFamily: "'Space Grotesk', sans-serif",
  },
  heading: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#1f2f56",
    margin: "0 0 6px",
  },
  sub: {
    fontSize: "14px",
    color: "#6b7280",
    margin: "0 0 28px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1.5px solid #e5e7eb",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
    fontFamily: "Manrope, sans-serif",
  },
  error: {
    background: "#fef2f2",
    color: "#dc2626",
    fontSize: "13px",
    padding: "10px 14px",
    borderRadius: "8px",
    margin: "0",
  },
  btn: {
    background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "12px",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "4px",
    fontFamily: "Manrope, sans-serif",
  },
  footer: {
    fontSize: "13px",
    color: "#6b7280",
    textAlign: "center",
    marginTop: "16px",
  },
  link: {
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 600,
  },
};
