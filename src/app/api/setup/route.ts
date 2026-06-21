import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST() {
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

    await sql`CREATE INDEX IF NOT EXISTS idx_qr_tracking ON qr_codes(tracking_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_qr_user ON qr_codes(user_id)`;

    return NextResponse.json({ ok: true, message: "Database tables created successfully." });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
