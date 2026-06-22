import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/qr/[trackingId]/analytics?days=30
// Returns daily scan counts for the last N days
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> },
) {
  const { trackingId } = await params;
  const id = trackingId.toUpperCase();
  const session = await getSession();

  // Verify ownership
  const qrRows = await sql`SELECT user_id FROM qr_codes WHERE tracking_id = ${id}`;
  if (qrRows.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (qrRows[0].user_id && (!session || (session.userId !== qrRows[0].user_id && !session.isAdmin))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const days = Math.min(90, Math.max(7, Number(request.nextUrl.searchParams.get("days") ?? 30)));

  const rows = await sql`
    SELECT
      DATE_TRUNC('day', scanned_at) AS day,
      COUNT(*)::int AS count
    FROM scan_logs
    WHERE tracking_id = ${id}
      AND scanned_at >= NOW() - (${days} || ' days')::INTERVAL
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  // Fill in zeros for missing days
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = new Map(rows.map((r: any) => [String(r.day).slice(0, 10), Number(r.count)]));
  const series: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, count: map.get(key) ?? 0 });
  }

  return NextResponse.json({ series, total: series.reduce((a, b) => a + b.count, 0) });
}
