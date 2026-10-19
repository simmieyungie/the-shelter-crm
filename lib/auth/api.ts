import "server-only";
import { NextResponse } from "next/server";
import { loadAccess, type Access } from "./scope";
import { getCurrentUser, type SessionUser } from "./session";

/** For route handlers: returns the user and access, or a 401 response. */
export async function apiAuth(): Promise<{ user: SessionUser; access: Access } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  return { user, access: await loadAccess(user.id) };
}
