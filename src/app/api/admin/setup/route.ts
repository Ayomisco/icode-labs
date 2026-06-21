import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import sql from "@/lib/db";

/**
 * POST /api/admin/setup
 * One-time endpoint to create the first admin account.
 * Body: { setupKey, email, password }
 * The setupKey must match the ADMIN_SETUP_KEY env var.
 */
export async function POST(request: NextRequest) {
  const { setupKey, email, password } = await request.json();

  if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
    return NextResponse.json({ error: "Invalid setup key." }, { status: 403 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    // Upsert: if email exists, make them admin; otherwise create new admin user
    const rows = await sql`
      INSERT INTO users (email, password_hash, is_admin)
      VALUES (${email.toLowerCase().trim()}, ${passwordHash}, TRUE)
      ON CONFLICT (email) DO UPDATE SET is_admin = TRUE
      RETURNING id, email, is_admin
    `;

    return NextResponse.json({
      ok: true,
      message: `Admin account ready for ${rows[0].email}. Sign in at /auth/login then visit /admin/dashboard.`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
