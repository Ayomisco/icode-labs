import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

type Params = { params: Promise<{ trackingId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { trackingId } = await params;
  const id = trackingId.toUpperCase();

  const rows = await sql`
    SELECT id, tracking_id, user_id, name, use_case, is_dynamic,
           destination_url, payload, form_data, design_settings,
           scan_count, is_active, created_at, updated_at
    FROM qr_codes WHERE tracking_id = ${id}
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "QR code not found." }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { trackingId } = await params;
  const id = trackingId.toUpperCase();
  const session = await getSession();

  const rows = await sql`SELECT id, user_id FROM qr_codes WHERE tracking_id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "QR code not found." }, { status: 404 });
  }

  const qr = rows[0];

  // If the QR belongs to a user, only that user (or an admin) can edit it
  if (qr.user_id && (!session || (session.userId !== qr.user_id && !session.isAdmin))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await request.json();

  if (body.name !== undefined) {
    await sql`UPDATE qr_codes SET name = ${body.name}, updated_at = NOW() WHERE tracking_id = ${id}`;
  }
  if (body.destinationUrl !== undefined) {
    await sql`
      UPDATE qr_codes SET destination_url = ${body.destinationUrl}, payload = ${body.destinationUrl}, updated_at = NOW()
      WHERE tracking_id = ${id} AND is_dynamic = TRUE
    `;
  }
  if (body.isActive !== undefined) {
    await sql`UPDATE qr_codes SET is_active = ${body.isActive}, updated_at = NOW() WHERE tracking_id = ${id}`;
  }
  if (body.expiresAt !== undefined) {
    const val = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
    await sql`UPDATE qr_codes SET expires_at = ${val}, updated_at = NOW() WHERE tracking_id = ${id}`;
  }
  if (body.maxScans !== undefined) {
    const val = body.maxScans ? Number(body.maxScans) : null;
    await sql`UPDATE qr_codes SET max_scans = ${val}, updated_at = NOW() WHERE tracking_id = ${id}`;
  }

  const updated = await sql`
    SELECT id, tracking_id, name, use_case, is_dynamic, destination_url,
           payload, scan_count, is_active, expires_at, max_scans, updated_at
    FROM qr_codes WHERE tracking_id = ${id}
  `;

  return NextResponse.json(updated[0]);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { trackingId } = await params;
  const id = trackingId.toUpperCase();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const rows = await sql`SELECT id, user_id FROM qr_codes WHERE tracking_id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "QR code not found." }, { status: 404 });
  }

  const qr = rows[0];
  if (!session.isAdmin && qr.user_id !== session.userId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  await sql`DELETE FROM qr_codes WHERE tracking_id = ${id}`;
  return NextResponse.json({ ok: true });
}
