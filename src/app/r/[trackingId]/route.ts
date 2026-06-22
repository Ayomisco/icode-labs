import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> },
) {
  const { trackingId } = await params;
  const id = trackingId.toUpperCase();
  const base = new URL(request.url).origin;

  const rows = await sql`
    SELECT destination_url, is_dynamic, is_active, scan_count, max_scans, expires_at
    FROM qr_codes WHERE tracking_id = ${id}
  `;

  if (rows.length === 0) {
    return NextResponse.redirect(`${base}/?expired=1`);
  }

  const qr = rows[0];

  // Check active flag
  if (!qr.is_active) {
    return NextResponse.redirect(`${base}/?expired=1`);
  }

  // Check expiry date
  if (qr.expires_at && new Date(qr.expires_at) < new Date()) {
    return NextResponse.redirect(`${base}/?expired=1`);
  }

  // Check scan limit
  if (qr.max_scans !== null && qr.scan_count >= qr.max_scans) {
    return NextResponse.redirect(`${base}/?expired=1`);
  }

  // Increment scan count and log (fire-and-forget)
  sql`UPDATE qr_codes SET scan_count = scan_count + 1, updated_at = NOW() WHERE tracking_id = ${id}`.catch(() => {});
  sql`INSERT INTO scan_logs (tracking_id) VALUES (${id})`.catch(() => {});

  if (qr.is_dynamic && qr.destination_url) {
    return NextResponse.redirect(qr.destination_url);
  }

  return NextResponse.redirect(`${base}/`);
}
