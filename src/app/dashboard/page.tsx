"use client";

import { useEffect, useState, useCallback } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

function QrModal({ payload, name, onClose }: { payload: string; name: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(payload, { width: 400, margin: 2, errorCorrectionLevel: "H" })
      .then(setDataUrl)
      .catch(() => {});
  }, [payload]);

  function download() {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name.replace(/\s+/g, "_")}_qr.png`;
    a.click();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 20, padding: "32px 28px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
          boxShadow: "0 32px 64px rgba(0,0,0,0.22)", maxWidth: 460, width: "90%",
        }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1f2f56", margin: 0, textAlign: "center" }}>
          {name}
        </h3>
        {dataUrl ? (
          <img src={dataUrl} alt={name} style={{ width: 300, height: 300, borderRadius: 8, border: "1px solid #e5e7eb" }} />
        ) : (
          <div style={{ width: 300, height: 300, background: "#f3f4f6", borderRadius: 8, display: "grid", placeItems: "center", color: "#9ca3af" }}>
            Loading…
          </div>
        )}
        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button
            onClick={download}
            disabled={!dataUrl}
            style={{
              flex: 1, padding: "11px 0", background: "linear-gradient(135deg,#2563eb,#0ea5e9)",
              color: "#fff", border: "none", borderRadius: 10, fontWeight: 700,
              fontSize: 14, cursor: "pointer",
            }}
          >
            Download PNG
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "11px 18px", background: "transparent",
              border: "1.5px solid #e5e7eb", borderRadius: 10,
              fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#6b7280",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const w = 120, h = 36, pad = 2;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1 || 1)) * (w - pad * 2);
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type QrCode = {
  id: string;
  tracking_id: string;
  name: string;
  use_case: string;
  is_dynamic: boolean;
  destination_url: string | null;
  payload: string;
  scan_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; userId: string } | null>(null);
  const [qrCodes, setQrCodes] = useState<QrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDest, setEditDest] = useState("");
  const [saving, setSaving] = useState(false);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, number[]>>({});
  const [viewQr, setViewQr] = useState<{ payload: string; name: string } | null>(null);

  useEffect(() => {
    // Check auth
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          router.replace("/auth/login");
          return;
        }
        setUser(data);
        return fetch("/api/qr", { credentials: "include" });
      })
      .then((r) => (r ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setQrCodes(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  // Generate tiny QR previews
  useEffect(() => {
    qrCodes.forEach((qr) => {
      if (qrImages[qr.tracking_id]) return;
      QRCode.toDataURL(qr.destination_url || qr.payload, { width: 80, margin: 1 })
        .then((url) => setQrImages((prev) => ({ ...prev, [qr.tracking_id]: url })))
        .catch(() => {});
    });
  }, [qrCodes, qrImages]);

  // Fetch 14-day sparkline analytics for each QR
  const fetchAnalytics = useCallback((trackingId: string) => {
    if (analytics[trackingId]) return;
    fetch(`/api/qr/${trackingId}/analytics?days=14`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.series) {
          setAnalytics((prev) => ({
            ...prev,
            [trackingId]: (data.series as { count: number }[]).map((d) => d.count),
          }));
        }
      })
      .catch(() => {});
  }, [analytics]);

  useEffect(() => {
    qrCodes.forEach((qr) => fetchAnalytics(qr.tracking_id));
  }, [qrCodes, fetchAnalytics]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function startEdit(qr: QrCode) {
    setEditing(qr.tracking_id);
    setEditName(qr.name);
    setEditDest(qr.destination_url ?? "");
  }

  async function saveEdit(trackingId: string) {
    setSaving(true);
    const body: Record<string, unknown> = { name: editName };
    const qr = qrCodes.find((q) => q.tracking_id === trackingId);
    if (qr?.is_dynamic) body.destinationUrl = editDest;

    const res = await fetch(`/api/qr/${trackingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json();
      setQrCodes((prev) => prev.map((q) => (q.tracking_id === trackingId ? { ...q, ...updated } : q)));
    }
    setEditing(null);
    setSaving(false);
  }

  async function toggleActive(qr: QrCode) {
    await fetch(`/api/qr/${qr.tracking_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !qr.is_active }),
    });
    setQrCodes((prev) => prev.map((q) => (q.tracking_id === qr.tracking_id ? { ...q, is_active: !qr.is_active } : q)));
  }

  async function deleteQr(trackingId: string) {
    await fetch(`/api/qr/${trackingId}`, { method: "DELETE", credentials: "include" });
    setQrCodes((prev) => prev.filter((q) => q.tracking_id !== trackingId));
    setDeleteConfirm(null);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";

  return (
    <div style={s.shell}>
      {viewQr && <QrModal payload={viewQr.payload} name={viewQr.name} onClose={() => setViewQr(null)} />}
      <header style={s.header}>
        <Link href="/" style={s.brand}>
          <NextImage src="/icode-logo.svg" alt="icode" width={30} height={30} />
          <span style={s.brandText}>icode</span>
        </Link>
        <div style={s.headerRight}>
          {user && <span style={s.userEmail}>{user.email}</span>}
          <Link href="/" style={s.newBtn}>+ New QR</Link>
          <Link href="/settings" style={s.logoutBtn}>Settings</Link>
          <button style={s.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main style={s.main}>
        <h1 style={s.pageTitle}>My QR Codes</h1>
        <p style={s.pageSub}>{qrCodes.length} QR code{qrCodes.length !== 1 ? "s" : ""} saved</p>

        {loading && <p style={s.hint}>Loading…</p>}

        {!loading && qrCodes.length === 0 && (
          <div style={s.emptyState}>
            <p style={s.emptyText}>You haven&apos;t saved any QR codes yet.</p>
            <Link href="/" style={s.newBtn}>Create your first QR →</Link>
          </div>
        )}

        <div style={s.grid}>
          {qrCodes.map((qr) => (
            <div key={qr.tracking_id} style={{ ...s.card, opacity: qr.is_active ? 1 : 0.6 }}>
              <div style={s.cardTop}>
                {qrImages[qr.tracking_id] ? (
                  <button
                    onClick={() => setViewQr({ payload: qr.destination_url || qr.payload, name: qr.name })}
                    title="Click to view full size"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: 8, flexShrink: 0 }}
                  >
                    <NextImage src={qrImages[qr.tracking_id]} alt="QR" width={72} height={72} unoptimized style={{ ...s.qrThumb, transition: "transform 150ms", display: "block" }} />
                  </button>
                ) : (
                  <div style={s.qrPlaceholder} />
                )}
                <div style={s.cardInfo}>
                  {editing === qr.tracking_id ? (
                    <input
                      style={s.editInput}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <strong style={s.cardName}>{qr.name}</strong>
                  )}
                  <span style={s.badge}>{qr.use_case}</span>
                  <span style={{ ...s.badge, background: qr.is_dynamic ? "#dbeafe" : "#f3f4f6", color: qr.is_dynamic ? "#1d4ed8" : "#6b7280" }}>
                    {qr.is_dynamic ? "Dynamic" : "Static"}
                  </span>
                </div>
              </div>

              <div style={s.trackRow}>
                <span style={s.trackLabel}>Tracking ID</span>
                <code style={s.trackId}>{qr.tracking_id}</code>
                <button
                  style={s.copyBtn}
                  onClick={() => navigator.clipboard.writeText(`${baseUrl}/r/${qr.tracking_id}`)}
                  title="Copy redirect URL"
                >
                  Copy link
                </button>
              </div>

              {qr.is_dynamic && (
                <div style={s.destRow}>
                  <span style={s.trackLabel}>Destination</span>
                  {editing === qr.tracking_id ? (
                    <input
                      style={{ ...s.editInput, flex: 1, fontSize: "12px" }}
                      value={editDest}
                      onChange={(e) => setEditDest(e.target.value)}
                      placeholder="https://..."
                    />
                  ) : (
                    <a href={qr.destination_url ?? ""} target="_blank" rel="noopener noreferrer" style={s.destLink}>
                      {qr.destination_url ?? "—"}
                    </a>
                  )}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={s.stats}>
                  <span style={s.stat}>{qr.scan_count} scan{qr.scan_count !== 1 ? "s" : ""}</span>
                  <span style={s.stat}>{new Date(qr.created_at).toLocaleDateString()}</span>
                  <span style={{ ...s.stat, color: qr.is_active ? "#16a34a" : "#dc2626" }}>
                    {qr.is_active ? "Active" : "Paused"}
                  </span>
                </div>
                {analytics[qr.tracking_id] && (
                  <div title="Scans — last 14 days">
                    <Sparkline data={analytics[qr.tracking_id]} />
                  </div>
                )}
              </div>

              <div style={s.actions}>
                {editing === qr.tracking_id ? (
                  <>
                    <button style={s.saveBtn} onClick={() => saveEdit(qr.tracking_id)} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button style={s.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button style={s.editBtn} onClick={() => startEdit(qr)}>Edit</button>
                    <button style={s.pauseBtn} onClick={() => toggleActive(qr)}>
                      {qr.is_active ? "Pause" : "Activate"}
                    </button>
                    {deleteConfirm === qr.tracking_id ? (
                      <>
                        <button style={s.deleteConfirmBtn} onClick={() => deleteQr(qr.tracking_id)}>Confirm delete</button>
                        <button style={s.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={s.deleteBtn} onClick={() => setDeleteConfirm(qr.tracking_id)}>Delete</button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
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
  userEmail: { fontSize: "13px", color: "#6b7280" },
  newBtn: {
    background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
    color: "#fff",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
  },
  logoutBtn: {
    background: "transparent",
    border: "1.5px solid #e5e7eb",
    borderRadius: "8px",
    padding: "7px 14px",
    fontSize: "13px",
    color: "#6b7280",
    cursor: "pointer",
    fontFamily: "Manrope, sans-serif",
  },
  main: { maxWidth: "900px", margin: "0 auto", padding: "40px 24px" },
  pageTitle: { fontSize: "26px", fontWeight: 700, color: "#1f2f56", margin: "0 0 4px" },
  pageSub: { fontSize: "14px", color: "#6b7280", margin: "0 0 32px" },
  hint: { color: "#6b7280", fontSize: "14px" },
  emptyState: { textAlign: "center", padding: "60px 0" },
  emptyText: { color: "#6b7280", fontSize: "16px", marginBottom: "20px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 2px 12px rgba(31,47,86,0.07)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  cardTop: { display: "flex", gap: "14px", alignItems: "flex-start" },
  qrThumb: { borderRadius: "8px", border: "1px solid #f3f4f6", flexShrink: 0 },
  qrPlaceholder: { width: 72, height: 72, background: "#f3f4f6", borderRadius: "8px", flexShrink: 0 },
  cardInfo: { display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: 0 },
  cardName: { fontSize: "15px", color: "#1f2f56", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: {
    display: "inline-block",
    background: "#f3f4f6",
    color: "#374151",
    fontSize: "11px",
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: "999px",
    width: "fit-content",
  },
  trackRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  destRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  trackLabel: { fontSize: "11px", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" },
  trackId: {
    fontSize: "13px",
    fontFamily: "monospace",
    background: "#f8fafc",
    padding: "2px 8px",
    borderRadius: "6px",
    color: "#1f2f56",
    border: "1px solid #e5e7eb",
  },
  copyBtn: {
    fontSize: "11px",
    color: "#2563eb",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "2px 4px",
    fontWeight: 600,
    fontFamily: "Manrope, sans-serif",
  },
  destLink: { fontSize: "12px", color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" },
  stats: { display: "flex", gap: "12px", flexWrap: "wrap" },
  stat: { fontSize: "12px", color: "#6b7280" },
  actions: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" },
  editBtn: { fontSize: "12px", padding: "6px 12px", borderRadius: "8px", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600, fontFamily: "Manrope, sans-serif", color: "#374151" },
  pauseBtn: { fontSize: "12px", padding: "6px 12px", borderRadius: "8px", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 600, fontFamily: "Manrope, sans-serif", color: "#374151" },
  deleteBtn: { fontSize: "12px", padding: "6px 12px", borderRadius: "8px", border: "1.5px solid #fee2e2", background: "#fff", cursor: "pointer", fontWeight: 600, fontFamily: "Manrope, sans-serif", color: "#dc2626" },
  deleteConfirmBtn: { fontSize: "12px", padding: "6px 12px", borderRadius: "8px", border: "none", background: "#dc2626", cursor: "pointer", fontWeight: 700, fontFamily: "Manrope, sans-serif", color: "#fff" },
  saveBtn: { fontSize: "12px", padding: "6px 14px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "Manrope, sans-serif" },
  cancelBtn: { fontSize: "12px", padding: "6px 12px", borderRadius: "8px", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", fontFamily: "Manrope, sans-serif", color: "#6b7280" },
  editInput: { padding: "6px 10px", borderRadius: "8px", border: "1.5px solid #2563eb", fontSize: "14px", outline: "none", fontFamily: "Manrope, sans-serif", width: "100%" },
};
