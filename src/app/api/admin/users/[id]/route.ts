import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// PATCH: toggle is_admin
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { id } = await params;

  // Prevent self-demotion
  if (id === session.userId) {
    return NextResponse.json({ error: "You cannot change your own admin status." }, { status: 400 });
  }

  const body = await request.json();

  if (body.isAdmin !== undefined) {
    await sql`UPDATE users SET is_admin = ${body.isAdmin} WHERE id = ${id}`;
  }

  const rows = await sql`SELECT id, email, is_admin, created_at FROM users WHERE id = ${id}`;
  if (rows.length === 0) return NextResponse.json({ error: "User not found." }, { status: 404 });

  return NextResponse.json(rows[0]);
}

// DELETE: remove user (QR codes become anonymous via ON DELETE SET NULL)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { id } = await params;

  if (id === session.userId) {
    return NextResponse.json({ error: "You cannot delete your own account here." }, { status: 400 });
  }

  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
