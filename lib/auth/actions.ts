"use server";

import { eq, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/mail";
import { normalisePhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { PARISH_COOKIE } from "./context";
import { verifyPassword } from "./password";
import {
  clearSessionCookie,
  createMagicLink,
  createSession,
  invalidateSession,
  SESSION_COOKIE,
  setSessionCookie,
} from "./session";

export type LoginState = { error?: string; message?: string };

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

const passwordSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your phone number or email."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { identifier, password, next } = parsed.data;

  const ip = await clientKey();
  // Overridable for automated tests, which sign in many times from one machine.
  const perMinute = Number(process.env.LOGIN_RATE_LIMIT ?? 10);
  const limited = rateLimit(`login:${ip}`, perMinute, 60_000);
  const limitedId = rateLimit(`login-id:${identifier.toLowerCase()}`, perMinute, 15 * 60_000);
  if (!limited.ok || !limitedId.ok) return { error: "Too many attempts. Wait a minute and try again." };

  const isEmail = identifier.includes("@");
  const phone = isEmail ? null : normalisePhone(identifier);
  const [user] = await db
    .select()
    .from(users)
    .where(isEmail ? eq(users.email, identifier.toLowerCase()) : or(eq(users.phone, phone ?? identifier)))
    .limit(1);

  if (!user || !user.passwordHash || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
    return { error: "That phone/email and password don't match." };
  }
  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  redirect(safeNext(next));
}

const magicSchema = z.object({ email: z.email("Enter a valid email address.") });

export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = magicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const email = parsed.data.email.toLowerCase();

  const ip = await clientKey();
  if (!rateLimit(`magic:${ip}`, 5, 10 * 60_000).ok) return { error: "Too many requests. Try again later." };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user && user.isActive) {
    const token = await createMagicLink(user.id);
    const base = process.env.APP_URL ?? "http://localhost:3000";
    await sendEmail(email, "Your sign-in link", `Sign in to Parish CRM:\n${base}/login/verify?token=${token}\n\nThis link expires in 15 minutes.`);
  }
  return { message: "If that email is registered, we've sent a sign-in link. It expires in 15 minutes." };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  await clearSessionCookie();
  redirect("/login");
}

export async function switchParish(formData: FormData) {
  const parishId = String(formData.get("parishId") ?? "");
  const jar = await cookies();
  jar.set(PARISH_COOKIE, parishId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}
