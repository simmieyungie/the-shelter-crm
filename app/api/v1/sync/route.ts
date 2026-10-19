import { NextResponse, type NextRequest } from "next/server";
import { apiAuth } from "@/lib/auth/api";
import { syncRequest } from "@/lib/offline/protocol";
import { rateLimit } from "@/lib/rate-limit";
import { applySyncItems } from "@/lib/sync/apply";

export const dynamic = "force-dynamic";

/** Offline outbox endpoint. Idempotent: resending the same clientId is a no-op. */
export async function POST(req: NextRequest) {
  const auth = await apiAuth();
  if (auth instanceof NextResponse) return auth;
  if (!rateLimit(`sync:${auth.user.id}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "30" } });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = syncRequest.safeParse(body);
  if (!parsed.success) {
    // Reject only the malformed items so good ones still go through.
    const items = Array.isArray((body as { items?: unknown[] })?.items) ? (body as { items: unknown[] }).items : null;
    if (!items) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { syncItem } = await import("@/lib/offline/protocol");
    const good = [];
    const results = [];
    for (const raw of items) {
      const one = syncItem.safeParse(raw);
      const clientId = (raw as { clientId?: string })?.clientId ?? "unknown";
      if (one.success) good.push(one.data);
      else results.push({ clientId, status: "rejected" as const, error: "Some details were invalid." });
    }
    const applied = good.length ? await applySyncItems(auth.access, auth.user.id, good) : { results: [], zoneTotals: [] };
    return NextResponse.json({ results: [...applied.results, ...results], zoneTotals: applied.zoneTotals });
  }
  return NextResponse.json(await applySyncItems(auth.access, auth.user.id, parsed.data.items));
}
