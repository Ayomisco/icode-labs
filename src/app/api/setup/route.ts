import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Allow the request only if it carries the SETUP_SECRET header OR comes from an admin session
  const setupSecret = process.env.SETUP_SECRET;
  const headerSecret = request.headers.get("x-setup-secret");
  const adminSession = await getAdminSession();

  if (!adminSession && (!setupSecret || headerSecret !== setupSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tracking_id VARCHAR(16) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL DEFAULT 'Untitled QR',
        use_case VARCHAR(50) NOT NULL,
        is_dynamic BOOLEAN NOT NULL DEFAULT FALSE,
        destination_url TEXT,
        payload TEXT NOT NULL,
        form_data JSONB NOT NULL DEFAULT '{}',
        design_settings JSONB NOT NULL DEFAULT '{}',
        scan_count INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Add expiry columns if they don't already exist (safe to run on existing tables)
    await sql`ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL`;
    await sql`ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS max_scans INTEGER DEFAULT NULL`;

    await sql`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tracking_id VARCHAR(16) NOT NULL,
        scanned_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_scan_tracking ON scan_logs(tracking_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_scan_date ON scan_logs(scanned_at)`;

    await sql`CREATE INDEX IF NOT EXISTS idx_qr_tracking ON qr_codes(tracking_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_qr_user ON qr_codes(user_id)`;

    return NextResponse.json({ ok: true, message: "Database tables created successfully." });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
