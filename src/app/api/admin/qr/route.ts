import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const userType = searchParams.get("userType") ?? "all"; // "all" | "authenticated" | "anonymous"
  const useCase = searchParams.get("useCase") ?? "";

  // Build query dynamically
  let rows;

  if (!search && userType === "all" && !useCase) {
    rows = await sql`
      SELECT q.id, q.tracking_id, q.name, q.use_case, q.is_dynamic,
             q.destination_url, q.payload, q.scan_count, q.is_active,
             q.created_at, q.updated_at,
             u.email AS user_email, u.id AS user_id
      FROM qr_codes q
      LEFT JOIN users u ON u.id = q.user_id
      ORDER BY q.created_at DESC
      LIMIT 500
    `;
  } else if (search && userType === "all" && !useCase) {
    rows = await sql`
      SELECT q.id, q.tracking_id, q.name, q.use_case, q.is_dynamic,
             q.destination_url, q.payload, q.scan_count, q.is_active,
             q.created_at, q.updated_at,
             u.email AS user_email, u.id AS user_id
      FROM qr_codes q
      LEFT JOIN users u ON u.id = q.user_id
      WHERE q.tracking_id ILIKE ${"%" + search + "%"}
         OR q.name ILIKE ${"%" + search + "%"}
         OR u.email ILIKE ${"%" + search + "%"}
         OR q.destination_url ILIKE ${"%" + search + "%"}
      ORDER BY q.created_at DESC
      LIMIT 500
    `;
  } else if (userType === "anonymous" && !search && !useCase) {
    rows = await sql`
      SELECT q.id, q.tracking_id, q.name, q.use_case, q.is_dynamic,
             q.destination_url, q.payload, q.scan_count, q.is_active,
             q.created_at, q.updated_at,
             NULL AS user_email, NULL AS user_id
      FROM qr_codes q
      WHERE q.user_id IS NULL
      ORDER BY q.created_at DESC
      LIMIT 500
    `;
  } else if (userType === "authenticated" && !search && !useCase) {
    rows = await sql`
      SELECT q.id, q.tracking_id, q.name, q.use_case, q.is_dynamic,
             q.destination_url, q.payload, q.scan_count, q.is_active,
             q.created_at, q.updated_at,
             u.email AS user_email, u.id AS user_id
      FROM qr_codes q
      JOIN users u ON u.id = q.user_id
      ORDER BY q.created_at DESC
      LIMIT 500
    `;
  } else {
    // General fallback with all filters combined
    rows = await sql`
      SELECT q.id, q.tracking_id, q.name, q.use_case, q.is_dynamic,
             q.destination_url, q.payload, q.scan_count, q.is_active,
             q.created_at, q.updated_at,
             u.email AS user_email, u.id AS user_id
      FROM qr_codes q
      LEFT JOIN users u ON u.id = q.user_id
      WHERE (
        ${search === "" ? sql`TRUE` : sql`(
          q.tracking_id ILIKE ${"%" + search + "%"} OR
          q.name ILIKE ${"%" + search + "%"} OR
          u.email ILIKE ${"%" + search + "%"}
        )`}
      )
      AND (${userType === "anonymous" ? sql`q.user_id IS NULL` : userType === "authenticated" ? sql`q.user_id IS NOT NULL` : sql`TRUE`})
      AND (${useCase ? sql`q.use_case = ${useCase}` : sql`TRUE`})
      ORDER BY q.created_at DESC
      LIMIT 500
    `;
  }

  return NextResponse.json(rows);
}
