import { NextResponse, type NextRequest } from "next/server";
import { consumeMagicLink, createSession, setSessionCookie } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const userId = token ? await consumeMagicLink(token) : null;
  if (!userId) return NextResponse.redirect(new URL("/login?error=link", req.url));
  const { token: sessionToken, expiresAt } = await createSession(userId);
  await setSessionCookie(sessionToken, expiresAt);
  return NextResponse.redirect(new URL("/", req.url));
}
