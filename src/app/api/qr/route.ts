import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, generateTrackingId, DYNAMIC_USE_CASES } from "@/lib/auth";

// GET /api/qr — list the current user's QR codes
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const rows = await sql`
    SELECT id, tracking_id, name, use_case, is_dynamic, destination_url, payload,
           scan_count, is_active, created_at, updated_at
    FROM qr_codes
    WHERE user_id = ${session.userId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json(rows);
}

// POST /api/qr — create (save) a new QR code
export async function POST(request: NextRequest) {
  const session = await getSession(); // nullable — anonymous OK

  const body = await request.json();
  const { name, useCase, formData, designSettings } = body;

  if (!useCase || !formData) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Rebuild the payload server-side from formData to keep it canonical
  const payload: string = body.payload;
  if (!payload) {
    return NextResponse.json({ error: "Payload is empty." }, { status: 400 });
  }

  const isDynamic = DYNAMIC_USE_CASES.has(useCase);

  // Derive the canonical origin from the request so it works on any host
  // without depending on NEXT_PUBLIC_BASE_URL being correctly formatted.
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "localhost:3000";
  const baseUrl = `${proto}://${host}`;

  // Try up to 3 times to get a unique tracking ID
  let trackingId = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    trackingId = generateTrackingId();
    const existing = await sql`SELECT 1 FROM qr_codes WHERE tracking_id = ${trackingId}`;
    if (existing.length === 0) break;
  }

  const redirectUrl = `${baseUrl}/r/${trackingId}`;
  const storedPayload = isDynamic ? redirectUrl : payload;
  const destinationUrl = isDynamic ? payload : null;

  const rows = await sql`
    INSERT INTO qr_codes (
      tracking_id, user_id, name, use_case, is_dynamic,
      destination_url, payload, form_data, design_settings
    ) VALUES (
      ${trackingId},
      ${session?.userId ?? null},
      ${name ?? `${useCase} QR`},
      ${useCase},
      ${isDynamic},
      ${destinationUrl},
      ${storedPayload},
      ${JSON.stringify(formData)},
      ${JSON.stringify(designSettings ?? {})}
    )
    RETURNING id, tracking_id, name, use_case, is_dynamic, destination_url, payload, created_at
  `;

  const qr = rows[0];

  return NextResponse.json({
    trackingId: qr.tracking_id,
    id: qr.id,
    name: qr.name,
    useCase: qr.use_case,
    isDynamic: qr.is_dynamic,
    destinationUrl: qr.destination_url,
    payload: qr.payload,         // the actual encoded value (redirect URL or direct)
    redirectUrl: isDynamic ? qr.payload : null,
    manageUrl: `/manage/${qr.tracking_id}`,
  });
}
