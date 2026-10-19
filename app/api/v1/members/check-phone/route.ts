import { NextResponse, type NextRequest } from "next/server";
import { apiAuth } from "@/lib/auth/api";
import { canReadParish } from "@/lib/auth/permissions";
import { membersWithPhone } from "@/lib/db/queries/count";
import { normalisePhone } from "@/lib/phone";

/** Duplicate check before registering a first-timer: warn, don't block. */
export async function GET(req: NextRequest) {
  const auth = await apiAuth();
  if (auth instanceof NextResponse) return auth;
  const parishId = req.nextUrl.searchParams.get("parishId") ?? "";
  if (!canReadParish(auth.access, parishId)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const phone = normalisePhone(req.nextUrl.searchParams.get("phone"));
  if (!phone) return NextResponse.json({ valid: false, matches: [] });
  return NextResponse.json({ valid: true, phone, matches: await membersWithPhone(parishId, phone) });
}
