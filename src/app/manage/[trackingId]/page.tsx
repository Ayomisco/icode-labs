"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";

type QrData = {
  tracking_id: string;
  name: string;
  use_case: string;
  is_dynamic: boolean;
  destination_url: string | null;
  payload: string;
  scan_count: number;
  is_active: boolean;
  created_at: string;
};

export default function ManagePage() {
  const { trackingId } = useParams<{ trackingId: string }>();
  const [qr, setQr] = useState<QrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qrImage, setQrImage] = useState("");
  const [newDest, setNewDest] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";

  useEffect(() => {
    fetch(`/api/qr/${trackingId}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setQr(data);
        setNewDest(data.destination_url ?? "");
        setLoading(false);
        QRCode.toDataURL(data.payload, { width: 200, margin: 2 })
          .then(setQrImage)
          .catch(() => {});
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [trackingId]);

  async function saveDestination() {
    if (!qr) return;
    setSaving(true);
    const res = await fetch(`/api/qr/${trackingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationUrl: newDest }),
    });
    if (res.ok) {
      const updated = await res.json();
      setQr((prev) => prev ? { ...prev, ...updated } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  function copyRedirectUrl() {
    navigator.clipboard.writeText(`${baseUrl}/r/${trackingId}`);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }

  if (loading) return <div style={s.center}>Loading…</div>;

  if (notFound) return (
    <div style={s.center}>
      <p style={{ color: "#dc2626", fontFamily: "Manrope, sans-serif" }}>QR code not found.</p>
      <Link href="/" style={s.link}>← Go to QR Builder</Link>
    </div>
  );

  return (
    <div style={s.shell}>
      <header style={s.header}>
        <Link href="/" style={s.brand}>
          <NextImage src="/icode-logo.svg" alt="icode" width={30} height={30} />
          <span style={s.brandText}>icode</span>
        </Link>
        <div style={s.headerRight}>
          <Link href="/auth/login" style={s.headerLink}>Sign in</Link>
          <Link href="/auth/register" style={s.ctaBtn}>Create account</Link>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.card}>
          <div style={s.cardHeader}>
            {qrImage && (
              <NextImage src={qrImage} alt="QR Code" width={140} height={140} unoptimized style={s.qrImg} />
            )}
            <div style={s.cardMeta}>
              <h1 style={s.qrName}>{qr!.name}</h1>
              <div style={s.badges}>
                <span style={s.badge}>{qr!.use_case}</span>
                <span style={{ ...s.badge, background: qr!.is_dynamic ? "#dbeafe" : "#f3f4f6", color: qr!.is_dynamic ? "#1d4ed8" : "#6b7280" }}>
                  {qr!.is_dynamic ? "Dynamic" : "Static"}
                </span>
                <span style={{ ...s.badge, background: qr!.is_active ? "#dcfce7" : "#fee2e2", color: qr!.is_active ? "#16a34a" : "#dc2626" }}>
                  {qr!.is_active ? "Active" : "Paused"}
                </span>
              </div>
              <div style={s.statsRow}>
                <span style={s.stat}>{qr!.scan_count} scans</span>
                <span style={s.stat}>Created {new Date(qr!.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div style={s.section}>
            <label style={s.sectionLabel}>Redirect link (share this)</label>
            <div style={s.copyRow}>
              <code style={s.codeBox}>{baseUrl}/r/{trackingId}</code>
              <button style={s.copyBtn} onClick={copyRedirectUrl}>
                {copyDone ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {qr!.is_dynamic && (
            <div style={s.section}>
              <label style={s.sectionLabel}>Destination URL</label>
              <p style={s.hint}>Change where this QR code redirects — no reprinting needed.</p>
              <input
                style={s.input}
                type="url"
                value={newDest}
                onChange={(e) => setNewDest(e.target.value)}
                placeholder="https://your-new-link.com"
              />
              {saved && <p style={s.successHint}>✓ Destination updated successfully!</p>}
              <button style={s.saveBtn} onClick={saveDestination} disabled={saving || !newDest}>
                {saving ? "Saving…" : "Update destination"}
              </button>
            </div>
          )}

          {!qr!.is_dynamic && (
            <div style={s.section}>
              <label style={s.sectionLabel}>Encoded content</label>
              <p style={s.hint}>This is a static QR. The content is baked into the image and cannot be changed.</p>
              <code style={{ ...s.codeBox, display: "block", wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                {qr!.payload}
              </code>
            </div>
          )}

          <div style={s.cta}>
            <p style={s.ctaText}>Create a free account to manage all your QR codes in one place.</p>
            <div style={s.ctaButtons}>
              <Link href="/auth/register" style={s.ctaBtnPrimary}>Create free account</Link>
              <Link href="/" style={s.ctaBtnSecondary}>Build another QR</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", background: "#f8fafc", fontFamily: "Manrope, sans-serif" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "16px", fontFamily: "Manrope, sans-serif" },
  header: { background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 32px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" },
  brandText: { fontSize: "20px", fontWeight: 700, color: "#1f2f56", fontFamily: "'Space Grotesk', sans-serif" },
  headerRight: { display: "flex", alignItems: "center", gap: "12px" },
  headerLink: { fontSize: "13px", color: "#374151", textDecoration: "none", fontWeight: 600 },
  ctaBtn: { background: "linear-gradient(135deg, #2563eb, #0ea5e9)", color: "#fff", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, textDecoration: "none" },
  main: { maxWidth: "600px", margin: "0 auto", padding: "40px 24px" },
  card: { background: "#fff", borderRadius: "20px", padding: "32px", boxShadow: "0 4px 24px rgba(31,47,86,0.08)" },
  cardHeader: { display: "flex", gap: "20px", alignItems: "flex-start", marginBottom: "28px" },
  qrImg: { borderRadius: "12px", border: "1px solid #f3f4f6", flexShrink: 0 },
  cardMeta: { flex: 1 },
  qrName: { fontSize: "22px", fontWeight: 700, color: "#1f2f56", margin: "0 0 10px" },
  badges: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" },
  badge: { fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", background: "#f3f4f6", color: "#374151" },
  statsRow: { display: "flex", gap: "12px" },
  stat: { fontSize: "12px", color: "#9ca3af" },
  section: { borderTop: "1px solid #f3f4f6", paddingTop: "20px", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "8px" },
  sectionLabel: { fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "#9ca3af", letterSpacing: "0.06em" },
  hint: { fontSize: "13px", color: "#6b7280", margin: "0" },
  successHint: { fontSize: "13px", color: "#16a34a", margin: "0" },
  copyRow: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  codeBox: { fontSize: "13px", fontFamily: "monospace", background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e5e7eb", color: "#1f2f56", flex: 1 },
  copyBtn: { fontSize: "12px", padding: "8px 14px", borderRadius: "8px", border: "1.5px solid #2563eb", background: "#fff", color: "#2563eb", fontWeight: 700, cursor: "pointer", fontFamily: "Manrope, sans-serif" },
  input: { padding: "10px 14px", borderRadius: "10px", border: "1.5px solid #e5e7eb", fontSize: "14px", outline: "none", fontFamily: "Manrope, sans-serif", width: "100%", boxSizing: "border-box" },
  saveBtn: { background: "linear-gradient(135deg, #2563eb, #0ea5e9)", color: "#fff", border: "none", borderRadius: "10px", padding: "11px 20px", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "Manrope, sans-serif", alignSelf: "flex-start" },
  cta: { background: "linear-gradient(135deg, #f0f4ff, #e8f5f0)", borderRadius: "14px", padding: "24px", marginTop: "8px" },
  ctaText: { fontSize: "14px", color: "#374151", margin: "0 0 14px", fontWeight: 500 },
  ctaButtons: { display: "flex", gap: "10px", flexWrap: "wrap" },
  ctaBtnPrimary: { background: "linear-gradient(135deg, #2563eb, #0ea5e9)", color: "#fff", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 700, textDecoration: "none" },
  ctaBtnSecondary: { background: "#fff", color: "#374151", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, textDecoration: "none", border: "1.5px solid #e5e7eb" },
  link: { color: "#2563eb", textDecoration: "none", fontWeight: 600, fontFamily: "Manrope, sans-serif" },
};
