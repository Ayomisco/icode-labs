import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";

  const rows = search
    ? await sql`
        SELECT u.id, u.email, u.is_admin, u.created_at,
               COUNT(q.id)::int AS qr_count
        FROM users u
        LEFT JOIN qr_codes q ON q.user_id = u.id
        WHERE u.email ILIKE ${"%" + search + "%"}
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT 200
      `
    : await sql`
        SELECT u.id, u.email, u.is_admin, u.created_at,
               COUNT(q.id)::int AS qr_count
        FROM users u
        LEFT JOIN qr_codes q ON q.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT 200
      `;

  return NextResponse.json(rows);
}
