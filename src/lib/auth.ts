import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
export const COOKIE_NAME = "icode_session";

export type SessionPayload = { userId: string; email: string; isAdmin: boolean };

export async function createToken(userId: string, email: string, isAdmin = false): Promise<string> {
  return new SignJWT({ userId, email, isAdmin })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session?.isAdmin) return null;
  return session;
}

// Branded QR code name: ICODE + 6 uppercase alphanum (no ambiguous chars: 0/O, 1/I/L)
const ALPHANUM = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateTrackingId(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  }
  return `ICODE${suffix}`;
}

// URL-type QR codes that benefit from dynamic redirect (can change destination without reprint)
export const DYNAMIC_USE_CASES = new Set([
  "link", "pdf", "app", "images", "video", "social", "whatsapp",
]);
