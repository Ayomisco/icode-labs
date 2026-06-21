"use client";

import { useState, FormEvent } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ManageSearchPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) { setError("Enter your QR code name."); return; }
    if (!normalized.startsWith("ICODE") || normalized.length !== 11) {
      setError("QR code names look like ICODEXXXXXX (ICODE + 6 characters).");
      return;
    }
    router.push(`/manage/${normalized}`);
  }

  return (
    <div style={s.shell}>
      <header style={s.header}>
        <Link href="/" style={s.brand}>
          <NextImage src="/icode-logo.svg" alt="icode" width={30} height={30} />
          <span style={s.brandText}>icode</span>
        </Link>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link href="/auth/login" style={s.headerLink}>Sign in</Link>
          <Link href="/auth/register" style={s.ctaBtn}>Create account</Link>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.card}>
          <h1 style={s.title}>Find Your QR Code</h1>
          <p style={s.sub}>
            Enter the unique name of your QR code (e.g. <code style={s.codeExample}>ICODEM3X7P2</code>) to view or update it.
          </p>

          <form onSubmit={handleSubmit} style={s.form}>
            <input
              style={s.input}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
              placeholder="ICODEXXXXXX"
              maxLength={11}
              autoFocus
              spellCheck={false}
            />
            {error && <p style={s.error}>{error}</p>}
            <button type="submit" style={s.btn}>Find my QR →</button>
          </form>

          <div style={s.tip}>
            <strong>Where do I find my QR code name?</strong>
            <p>When you saved your QR code, the tracking ID shown (e.g. ICODEM3X7P2) is your unique code name. Check your download email or the save confirmation you saw on the builder.</p>
          </div>

          <div style={s.authCta}>
            <p>Want to manage all your QR codes in one place?</p>
            <Link href="/auth/register" style={s.ctaBtnLarge}>Create a free account →</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", background: "linear-gradient(135deg,#f0f4ff,#e8f5f0)", fontFamily: "Manrope, sans-serif", display: "flex", flexDirection: "column" },
  header: { background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 32px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" },
  brandText: { fontSize: "20px", fontWeight: 700, color: "#1f2f56", fontFamily: "'Space Grotesk', sans-serif" },
  headerLink: { fontSize: "13px", color: "#374151", textDecoration: "none", fontWeight: 600 },
  ctaBtn: { background: "linear-gradient(135deg,#2563eb,#0ea5e9)", color: "#fff", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, textDecoration: "none" },
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" },
  card: { background: "#fff", borderRadius: "24px", padding: "44px 40px", width: "100%", maxWidth: "480px", boxShadow: "0 8px 40px rgba(31,47,86,0.10)" },
  title: { fontSize: "26px", fontWeight: 800, color: "#1f2f56", margin: "0 0 8px" },
  sub: { fontSize: "14px", color: "#6b7280", margin: "0 0 28px", lineHeight: 1.6 },
  codeExample: { fontFamily: "monospace", fontWeight: 700, background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", color: "#1f2f56" },
  form: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" },
  input: {
    padding: "13px 16px",
    borderRadius: "12px",
    border: "2px solid #e2e8f0",
    fontSize: "20px",
    fontFamily: "monospace",
    fontWeight: 700,
    letterSpacing: "0.1em",
    outline: "none",
    textAlign: "center",
    color: "#1f2f56",
    textTransform: "uppercase",
  },
  error: { background: "#fef2f2", color: "#dc2626", fontSize: "13px", padding: "10px 14px", borderRadius: "8px", margin: "0" },
  btn: { background: "linear-gradient(135deg,#2563eb,#0ea5e9)", color: "#fff", border: "none", borderRadius: "12px", padding: "13px", fontSize: "16px", fontWeight: 700, cursor: "pointer", fontFamily: "Manrope, sans-serif" },
  tip: { background: "#f8fafc", borderRadius: "12px", padding: "16px", fontSize: "13px", color: "#374151", lineHeight: 1.6 },
  authCta: { borderTop: "1px solid #f1f5f9", marginTop: "24px", paddingTop: "24px", textAlign: "center", fontSize: "14px", color: "#6b7280" },
  ctaBtnLarge: { display: "inline-block", marginTop: "12px", background: "linear-gradient(135deg,#059669,#10b981)", color: "#fff", padding: "11px 24px", borderRadius: "10px", fontWeight: 700, textDecoration: "none", fontSize: "14px" },
};
