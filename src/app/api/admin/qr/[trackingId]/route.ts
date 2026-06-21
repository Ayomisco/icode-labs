import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

type Params = { params: Promise<{ trackingId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { trackingId } = await params;
  const id = trackingId.toUpperCase();
  const body = await request.json();

  if (body.name !== undefined) {
    await sql`UPDATE qr_codes SET name = ${body.name}, updated_at = NOW() WHERE tracking_id = ${id}`;
  }
  if (body.destinationUrl !== undefined) {
    await sql`
      UPDATE qr_codes SET destination_url = ${body.destinationUrl}, updated_at = NOW()
      WHERE tracking_id = ${id}
    `;
  }
  if (body.isActive !== undefined) {
    await sql`UPDATE qr_codes SET is_active = ${body.isActive}, updated_at = NOW() WHERE tracking_id = ${id}`;
  }

  const rows = await sql`
    SELECT q.id, q.tracking_id, q.name, q.use_case, q.is_dynamic,
           q.destination_url, q.payload, q.scan_count, q.is_active,
           q.updated_at, u.email AS user_email
    FROM qr_codes q
    LEFT JOIN users u ON u.id = q.user_id
    WHERE q.tracking_id = ${id}
  `;

  return NextResponse.json(rows[0] ?? { error: "Not found" });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { trackingId } = await params;
  const id = trackingId.toUpperCase();

  await sql`DELETE FROM qr_codes WHERE tracking_id = ${id}`;
  return NextResponse.json({ ok: true });
}
