import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS total_users,
      (SELECT COUNT(*)::int FROM qr_codes) AS total_qr,
      (SELECT COUNT(*)::int FROM qr_codes WHERE user_id IS NULL) AS anonymous_qr,
      (SELECT COALESCE(SUM(scan_count), 0)::int FROM qr_codes) AS total_scans,
      (SELECT COUNT(*)::int FROM qr_codes WHERE is_active = TRUE) AS active_qr,
      (SELECT COUNT(*)::int FROM qr_codes WHERE is_dynamic = TRUE) AS dynamic_qr,
      (SELECT COUNT(*)::int FROM qr_codes WHERE created_at > NOW() - INTERVAL '7 days') AS new_this_week
  `;

  return NextResponse.json(stats);
}
