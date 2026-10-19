import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { apiAuth } from "@/lib/auth/api";
import { canReadParish } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { zoneTotalsFor } from "@/lib/db/queries/count";
import { serviceEvents } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Latest sum of other ushers' tallies for a service ("Zone so far"). */
export async function GET(req: NextRequest) {
  const auth = await apiAuth();
  if (auth instanceof NextResponse) return auth;
  const eventId = req.nextUrl.searchParams.get("event") ?? "";
  const [ev] = await db.select({ parishId: serviceEvents.parishId }).from(serviceEvents).where(eq(serviceEvents.id, eventId)).catch(() => []);
  if (!ev || !canReadParish(auth.access, ev.parishId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ zoneTotals: await zoneTotalsFor(db, [eventId], auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
