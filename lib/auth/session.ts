import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { magicLinkTokens, sessions, users } from "@/lib/db/schema";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;
const RENEW_WITHIN_DAYS = 15;
const DAY_MS = 86_400_000;

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  memberId: string | null;
};

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Validates a raw session token. Extends the session when it is close to expiry. */
export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const sessionId = hashToken(token);
  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        memberId: users.memberId,
        isActive: users.isActive,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now() || !row.user.isActive) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  if (row.expiresAt.getTime() - Date.now() < RENEW_WITHIN_DAYS * DAY_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) })
      .where(eq(sessions.id, sessionId));
  }
  const { isActive: _ignored, ...user } = row.user;
  void _ignored;
  return user;
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** Current user for this request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

// --- Magic links -----------------------------------------------------------

const MAGIC_LINK_MINUTES = 15;

export async function createMagicLink(userId: string): Promise<string> {
  const token = generateToken();
  await db.insert(magicLinkTokens).values({
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + MAGIC_LINK_MINUTES * 60_000),
  });
  return token;
}

/** Consumes a magic-link token. Returns the user id, or null if invalid/expired/used. */
export async function consumeMagicLink(token: string): Promise<string | null> {
  const [row] = await db
    .update(magicLinkTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(magicLinkTokens.id, hashToken(token)),
        isNull(magicLinkTokens.usedAt),
        gt(magicLinkTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: magicLinkTokens.userId });
  return row?.userId ?? null;
}
