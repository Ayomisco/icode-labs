import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> },
) {
  const { trackingId } = await params;
  const id = trackingId.toUpperCase(); // normalize — typed URLs may be lowercase
  const base = new URL(request.url).origin;

  const rows = await sql`
    SELECT destination_url, is_dynamic, is_active
    FROM qr_codes WHERE tracking_id = ${id}
  `;

  if (rows.length === 0 || !rows[0].is_active) {
    return NextResponse.redirect(`${base}/?expired=1`);
  }

  const qr = rows[0];

  // Fire-and-forget scan count increment
  sql`UPDATE qr_codes SET scan_count = scan_count + 1 WHERE tracking_id = ${id}`.catch(() => {});

  if (qr.is_dynamic && qr.destination_url) {
    return NextResponse.redirect(qr.destination_url);
  }

  return NextResponse.redirect(`${base}/`);
}
