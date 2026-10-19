import { NextResponse, type NextRequest } from "next/server";
import { apiAuth } from "@/lib/auth/api";
import { searchMembersForCheckin } from "@/lib/db/queries/count";

export async function GET(req: NextRequest) {
  const auth = await apiAuth();
  if (auth instanceof NextResponse) return auth;
  const parishId = req.nextUrl.searchParams.get("parishId") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ members: await searchMembersForCheckin(auth.access, parishId, q) });
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
}
