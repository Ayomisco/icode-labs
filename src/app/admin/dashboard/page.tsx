"use client";

import { useEffect, useState, useCallback } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

type Stats = {
  total_users: number;
  total_qr: number;
  anonymous_qr: number;
  total_scans: number;
  active_qr: number;
  dynamic_qr: number;
  new_this_week: number;
};

type AdminUser = {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  qr_count: number;
};

type AdminQr = {
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
  user_email: string | null;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("");
  const [tab, setTab] = useState<"overview" | "users" | "qr">("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [qrList, setQrList] = useState<AdminQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [qrSearch, setQrSearch] = useState("");
  const [qrUserType, setQrUserType] = useState("all");
  const [qrUseCase, setQrUseCase] = useState("");
  const [editingQr, setEditingQr] = useState<AdminQr | null>(null);
  const [editName, setEditName] = useState("");
  const [editDest, setEditDest] = useState("");
  const [savingQr, setSavingQr] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<string | null>(null);
  const [deleteConfirmQr, setDeleteConfirmQr] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Auth guard
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.isAdmin) { router.replace("/auth/login"); return; }
        setAdminEmail(data.email);
        setLoading(false);
      })
      .catch(() => router.replace("/auth/login"));
  }, [router]);

  // Load stats
  useEffect(() => {
    if (loading) return;
    fetch("/api/admin/stats", { credentials: "include" })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [loading]);

  const loadUsers = useCallback(async () => {
    const params = userSearch ? `?search=${encodeURIComponent(userSearch)}` : "";
    const rows = await fetch(`/api/admin/users${params}`, { credentials: "include" }).then((r) => r.json());
    if (Array.isArray(rows)) setUsers(rows);
  }, [userSearch]);

  const loadQr = useCallback(async () => {
    const params = new URLSearchParams();
    if (qrSearch) params.set("search", qrSearch);
    if (qrUserType !== "all") params.set("userType", qrUserType);
    if (qrUseCase) params.set("useCase", qrUseCase);
    const rows = await fetch(`/api/admin/qr?${params}`, { credentials: "include" }).then((r) => r.json());
    if (Array.isArray(rows)) setQrList(rows);
  }, [qrSearch, qrUserType, qrUseCase]);

  useEffect(() => { if (!loading && tab === "users") loadUsers(); }, [loading, tab, loadUsers]);
  useEffect(() => { if (!loading && tab === "qr") loadQr(); }, [loading, tab, loadQr]);

  async function toggleAdmin(user: AdminUser) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: !user.is_admin }),
    });
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_admin: !user.is_admin } : u));
    showToast(user.is_admin ? "Admin revoked." : "Admin granted.");
  }

  async function deleteUser(id: string) {
    await fetch(`/api/admin/users/${id}`, { method: "DELETE", credentials: "include" });
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setDeleteConfirmUser(null);
    showToast("User deleted.");
  }

  async function toggleQrActive(qr: AdminQr) {
    const res = await fetch(`/api/admin/qr/${qr.tracking_id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !qr.is_active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setQrList((prev) => prev.map((q) => q.tracking_id === qr.tracking_id ? { ...q, ...updated } : q));
      showToast(qr.is_active ? "QR paused." : "QR activated.");
    }
  }

  async function deleteQr(trackingId: string) {
    await fetch(`/api/admin/qr/${trackingId}`, { method: "DELETE", credentials: "include" });
    setQrList((prev) => prev.filter((q) => q.tracking_id !== trackingId));
    setDeleteConfirmQr(null);
    showToast("QR code deleted.");
  }

  async function saveQrEdit() {
    if (!editingQr) return;
    setSavingQr(true);
    const body: Record<string, unknown> = { name: editName };
    if (editingQr.is_dynamic) body.destinationUrl = editDest;
    const res = await fetch(`/api/admin/qr/${editingQr.tracking_id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setQrList((prev) => prev.map((q) => q.tracking_id === editingQr.tracking_id ? { ...q, ...updated } : q));
      setEditingQr(null);
      showToast("QR updated.");
    }
    setSavingQr(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (loading) return <div style={s.center}>Checking access…</div>;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";

  return (
    <div style={s.shell}>
      {/* ── Toast ── */}
      {toast && <div style={s.toast}>{toast}</div>}

      {/* ── Edit Modal ── */}
      {editingQr && (
        <div style={s.overlay} onClick={() => setEditingQr(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Edit QR Code</h3>
            <p style={s.modalCode}>{editingQr.tracking_id}</p>
            <label style={s.label}>
              Display name
              <input style={s.input} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            {editingQr.is_dynamic && (
              <label style={s.label}>
                Destination URL
                <input style={s.input} type="url" value={editDest} onChange={(e) => setEditDest(e.target.value)} placeholder="https://..." />
              </label>
            )}
            <div style={s.modalActions}>
              <button style={s.btnPrimary} onClick={saveQrEdit} disabled={savingQr}>
                {savingQr ? "Saving…" : "Save changes"}
              </button>
              <button style={s.btnGhost} onClick={() => setEditingQr(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <Link href="/" style={s.brand}>
            <NextImage src="/icode-logo.svg" alt="icode" width={28} height={28} />
            <span style={s.brandText}>icode</span>
          </Link>
          <span style={s.adminPill}>Admin</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.adminEmail}>{adminEmail}</span>
          <Link href="/dashboard" style={s.headerLink}>User Dashboard</Link>
          <button style={s.btnGhost} onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main style={s.main}>
        <h1 style={s.pageTitle}>Platform Dashboard</h1>

        {/* ── Stats Row ── */}
        {stats && (
          <div style={s.statsGrid}>
            {[
              { label: "Total Users", value: stats.total_users, color: "#2563eb" },
              { label: "Total QR Codes", value: stats.total_qr, color: "#059669" },
              { label: "Anonymous QRs", value: stats.anonymous_qr, color: "#d97706" },
              { label: "Total Scans", value: stats.total_scans, color: "#7c3aed" },
              { label: "Active QRs", value: stats.active_qr, color: "#16a34a" },
              { label: "Dynamic QRs", value: stats.dynamic_qr, color: "#0891b2" },
              { label: "New This Week", value: stats.new_this_week, color: "#db2777" },
            ].map((item) => (
              <div key={item.label} style={s.statCard}>
                <span style={{ ...s.statValue, color: item.color }}>{item.value.toLocaleString()}</span>
                <span style={s.statLabel}>{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={s.tabs}>
          {(["overview", "users", "qr"] as const).map((t) => (
            <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
              {t === "overview" ? "Overview" : t === "users" ? `Users (${users.length || "…"})` : `QR Codes (${qrList.length || "…"})`}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW TAB ══ */}
        {tab === "overview" && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Platform Summary</h2>
            {stats ? (
              <div style={s.summaryGrid}>
                <div style={s.summaryCard}>
                  <h3 style={s.summaryCardTitle}>User Breakdown</h3>
                  <div style={s.summaryRow}><span>Registered users</span><strong>{stats.total_users}</strong></div>
                  <div style={s.summaryRow}><span>Authenticated QRs</span><strong>{stats.total_qr - stats.anonymous_qr}</strong></div>
                  <div style={s.summaryRow}><span>Anonymous QRs</span><strong>{stats.anonymous_qr}</strong></div>
                </div>
                <div style={s.summaryCard}>
                  <h3 style={s.summaryCardTitle}>QR Health</h3>
                  <div style={s.summaryRow}><span>Active QRs</span><strong style={{ color: "#16a34a" }}>{stats.active_qr}</strong></div>
                  <div style={s.summaryRow}><span>Paused QRs</span><strong style={{ color: "#dc2626" }}>{stats.total_qr - stats.active_qr}</strong></div>
                  <div style={s.summaryRow}><span>Dynamic (redirect)</span><strong>{stats.dynamic_qr}</strong></div>
                  <div style={s.summaryRow}><span>Static</span><strong>{stats.total_qr - stats.dynamic_qr}</strong></div>
                </div>
                <div style={s.summaryCard}>
                  <h3 style={s.summaryCardTitle}>Engagement</h3>
                  <div style={s.summaryRow}><span>Total scans</span><strong style={{ color: "#7c3aed" }}>{stats.total_scans.toLocaleString()}</strong></div>
                  <div style={s.summaryRow}><span>Avg scans/QR</span><strong>{stats.total_qr ? (stats.total_scans / stats.total_qr).toFixed(1) : "0"}</strong></div>
                  <div style={s.summaryRow}><span>New QRs this week</span><strong style={{ color: "#db2777" }}>{stats.new_this_week}</strong></div>
                </div>
              </div>
            ) : (
              <p style={s.muted}>Loading stats…</p>
            )}

            <div style={{ marginTop: "28px" }}>
              <h2 style={s.sectionTitle}>Quick Actions</h2>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button style={s.btnSecondary} onClick={() => { setTab("users"); loadUsers(); }}>View All Users →</button>
                <button style={s.btnSecondary} onClick={() => { setTab("qr"); loadQr(); }}>View All QR Codes →</button>
                <button style={s.btnSecondary} onClick={() => { setTab("qr"); setQrUserType("anonymous"); loadQr(); }}>View Anonymous QRs →</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ USERS TAB ══ */}
        {tab === "users" && (
          <div style={s.section}>
            <div style={s.tableToolbar}>
              <input
                style={s.searchInput}
                placeholder="Search by email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadUsers()}
              />
              <button style={s.btnPrimary} onClick={loadUsers}>Search</button>
            </div>

            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Email", "Joined", "QR Codes", "Role", "Actions"].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={5} style={s.emptyCell}>No users found.</td></tr>
                  )}
                  {users.map((user) => (
                    <tr key={user.id} style={s.tr}>
                      <td style={s.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={s.avatar}>{user.email[0].toUpperCase()}</div>
                          <span style={{ fontSize: "13px" }}>{user.email}</span>
                        </div>
                      </td>
                      <td style={s.td}>{new Date(user.created_at).toLocaleDateString()}</td>
                      <td style={s.td}><strong>{user.qr_count}</strong></td>
                      <td style={s.td}>
                        <span style={{ ...s.rolePill, background: user.is_admin ? "#dbeafe" : "#f3f4f6", color: user.is_admin ? "#1d4ed8" : "#6b7280" }}>
                          {user.is_admin ? "Admin" : "User"}
                        </span>
                      </td>
                      <td style={s.td}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            style={s.actionBtn}
                            onClick={() => toggleAdmin(user)}
                            title={user.is_admin ? "Revoke admin" : "Make admin"}
                          >
                            {user.is_admin ? "Revoke admin" : "Make admin"}
                          </button>
                          <button
                            style={{ ...s.actionBtn, color: "#dc2626", borderColor: "#fee2e2" }}
                            onClick={() => setDeleteConfirmUser(user.id)}
                          >
                            Delete
                          </button>
                        </div>
                        {deleteConfirmUser === user.id && (
                          <div style={s.confirmRow}>
                            <span style={{ fontSize: "12px", color: "#dc2626" }}>Delete this user?</span>
                            <button style={s.dangerBtn} onClick={() => deleteUser(user.id)}>Confirm</button>
                            <button style={s.actionBtn} onClick={() => setDeleteConfirmUser(null)}>Cancel</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ QR CODES TAB ══ */}
        {tab === "qr" && (
          <div style={s.section}>
            <div style={s.tableToolbar}>
              <input
                style={s.searchInput}
                placeholder="Search by name, ICODE…, email, URL…"
                value={qrSearch}
                onChange={(e) => setQrSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadQr()}
              />
              <select style={s.select} value={qrUserType} onChange={(e) => setQrUserType(e.target.value)}>
                <option value="all">All users</option>
                <option value="authenticated">Authenticated only</option>
                <option value="anonymous">Anonymous only</option>
              </select>
              <select style={s.select} value={qrUseCase} onChange={(e) => setQrUseCase(e.target.value)}>
                <option value="">All types</option>
                {["link","text","email","call","sms","vcard","whatsapp","wifi","pdf","app","images","video","social","event","barcode2d"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button style={s.btnPrimary} onClick={loadQr}>Filter</button>
            </div>

            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Code Name", "Display Name", "Type", "Owner", "Destination / Content", "Scans", "Status", "Created", "Actions"].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qrList.length === 0 && (
                    <tr><td colSpan={9} style={s.emptyCell}>No QR codes found.</td></tr>
                  )}
                  {qrList.map((qr) => (
                    <tr key={qr.tracking_id} style={{ ...s.tr, opacity: qr.is_active ? 1 : 0.6 }}>
                      <td style={s.td}>
                        <div>
                          <a
                            href={`${baseUrl}/r/${qr.tracking_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={s.codeLink}
                          >
                            {qr.tracking_id}
                          </a>
                          <div>
                            <span style={{ ...s.typePill, background: qr.is_dynamic ? "#dbeafe" : "#f3f4f6", color: qr.is_dynamic ? "#1d4ed8" : "#6b7280" }}>
                              {qr.is_dynamic ? "dynamic" : "static"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={s.td}><span style={{ fontSize: "13px" }}>{qr.name}</span></td>
                      <td style={s.td}><span style={s.typePill}>{qr.use_case}</span></td>
                      <td style={s.td}>
                        {qr.user_email ? (
                          <span style={{ fontSize: "12px", color: "#374151" }}>{qr.user_email}</span>
                        ) : (
                          <span style={{ ...s.typePill, background: "#fef3c7", color: "#92400e" }}>Anonymous</span>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={s.destText} title={qr.destination_url ?? qr.payload}>
                          {(qr.destination_url ?? qr.payload).substring(0, 40)}{(qr.destination_url ?? qr.payload).length > 40 ? "…" : ""}
                        </span>
                      </td>
                      <td style={{ ...s.td, textAlign: "center" }}><strong>{qr.scan_count}</strong></td>
                      <td style={s.td}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: qr.is_active ? "#16a34a" : "#dc2626" }}>
                          {qr.is_active ? "Active" : "Paused"}
                        </span>
                      </td>
                      <td style={s.td}><span style={{ fontSize: "12px", color: "#9ca3af" }}>{new Date(qr.created_at).toLocaleDateString()}</span></td>
                      <td style={s.td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              style={s.actionBtn}
                              onClick={() => { setEditingQr(qr); setEditName(qr.name); setEditDest(qr.destination_url ?? ""); }}
                            >
                              Edit
                            </button>
                            <button
                              style={s.actionBtn}
                              onClick={() => toggleQrActive(qr)}
                            >
                              {qr.is_active ? "Pause" : "Activate"}
                            </button>
                            <button
                              style={{ ...s.actionBtn, color: "#dc2626", borderColor: "#fee2e2" }}
                              onClick={() => setDeleteConfirmQr(qr.tracking_id)}
                            >
                              Delete
                            </button>
                          </div>
                          {deleteConfirmQr === qr.tracking_id && (
                            <div style={s.confirmRow}>
                              <span style={{ fontSize: "11px", color: "#dc2626" }}>Delete?</span>
                              <button style={s.dangerBtn} onClick={() => deleteQr(qr.tracking_id)}>Yes</button>
                              <button style={s.actionBtn} onClick={() => setDeleteConfirmQr(null)}>No</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", background: "#f1f5f9", fontFamily: "Manrope, sans-serif" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Manrope, sans-serif", color: "#6b7280" },

  // Toast
  toast: { position: "fixed", top: "16px", right: "16px", background: "#1f2f56", color: "#fff", padding: "12px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" },

  // Modal overlay
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "20px", padding: "32px", width: "100%", maxWidth: "480px", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: "16px" },
  modalTitle: { fontSize: "18px", fontWeight: 700, color: "#1f2f56", margin: "0" },
  modalCode: { fontSize: "14px", fontFamily: "monospace", background: "#f1f5f9", padding: "6px 12px", borderRadius: "8px", color: "#1f2f56", margin: "0", fontWeight: 700 },
  modalActions: { display: "flex", gap: "10px", marginTop: "8px" },

  // Header
  header: { background: "#1f2f56", padding: "0 28px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  brand: { display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" },
  brandText: { fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" },
  adminPill: { background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", letterSpacing: "0.08em" },
  headerRight: { display: "flex", alignItems: "center", gap: "12px" },
  adminEmail: { fontSize: "13px", color: "rgba(255,255,255,0.6)" },
  headerLink: { fontSize: "13px", color: "rgba(255,255,255,0.8)", textDecoration: "none", fontWeight: 600 },

  // Layout
  main: { maxWidth: "1300px", margin: "0 auto", padding: "32px 24px" },
  pageTitle: { fontSize: "26px", fontWeight: 700, color: "#1f2f56", margin: "0 0 24px" },

  // Stats
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "14px", marginBottom: "28px" },
  statCard: { background: "#fff", borderRadius: "14px", padding: "18px", boxShadow: "0 2px 8px rgba(31,47,86,0.06)", display: "flex", flexDirection: "column", gap: "4px" },
  statValue: { fontSize: "28px", fontWeight: 800 },
  statLabel: { fontSize: "12px", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" },

  // Tabs
  tabs: { display: "flex", gap: "4px", marginBottom: "20px", background: "#e2e8f0", borderRadius: "12px", padding: "4px", width: "fit-content" },
  tab: { padding: "8px 20px", borderRadius: "9px", border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#64748b", fontFamily: "Manrope, sans-serif" },
  tabActive: { background: "#fff", color: "#1f2f56", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" },

  // Section
  section: { background: "#fff", borderRadius: "16px", padding: "24px", boxShadow: "0 2px 8px rgba(31,47,86,0.06)" },
  sectionTitle: { fontSize: "18px", fontWeight: 700, color: "#1f2f56", margin: "0 0 16px" },

  // Summary overview
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" },
  summaryCard: { background: "#f8fafc", borderRadius: "12px", padding: "16px", border: "1px solid #e2e8f0" },
  summaryCardTitle: { fontSize: "13px", fontWeight: 700, color: "#374151", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" },
  summaryRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: "13px", color: "#374151" },

  // Toolbar
  tableToolbar: { display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" },
  searchInput: { flex: 1, minWidth: "200px", padding: "9px 14px", borderRadius: "9px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "Manrope, sans-serif" },
  select: { padding: "9px 12px", borderRadius: "9px", border: "1.5px solid #e2e8f0", fontSize: "13px", fontFamily: "Manrope, sans-serif", background: "#fff" },

  // Table
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { padding: "10px 14px", textAlign: "left" as const, fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" as const },
  tr: { borderBottom: "1px solid #f8fafc", transition: "background 0.1s" },
  td: { padding: "12px 14px", verticalAlign: "middle" as const },
  emptyCell: { padding: "40px", textAlign: "center" as const, color: "#9ca3af", fontSize: "14px" },

  // Elements
  avatar: { width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "12px", fontWeight: 700, flexShrink: 0 },
  rolePill: { fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", display: "inline-block" },
  typePill: { fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: "#f3f4f6", color: "#374151", display: "inline-block" },
  codeLink: { fontSize: "13px", fontWeight: 700, fontFamily: "monospace", color: "#1d4ed8", textDecoration: "none" },
  destText: { fontSize: "12px", color: "#6b7280", fontFamily: "monospace" },

  // Actions
  actionBtn: { fontSize: "11px", padding: "4px 10px", borderRadius: "6px", border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600, fontFamily: "Manrope, sans-serif", color: "#374151", whiteSpace: "nowrap" as const },
  confirmRow: { display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" },
  dangerBtn: { fontSize: "11px", padding: "4px 10px", borderRadius: "6px", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "Manrope, sans-serif" },

  // Buttons
  btnPrimary: { padding: "9px 18px", borderRadius: "9px", border: "none", background: "linear-gradient(135deg,#2563eb,#0ea5e9)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", fontFamily: "Manrope, sans-serif" },
  btnSecondary: { padding: "9px 18px", borderRadius: "9px", border: "1.5px solid #e2e8f0", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "Manrope, sans-serif" },
  btnGhost: { padding: "8px 14px", borderRadius: "8px", border: "1.5px solid rgba(255,255,255,0.2)", background: "transparent", color: "rgba(255,255,255,0.8)", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "Manrope, sans-serif" },

  // Form
  label: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#374151" },
  input: { padding: "10px 14px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "14px", outline: "none", fontFamily: "Manrope, sans-serif" },
  muted: { color: "#9ca3af", fontSize: "14px" },
};
