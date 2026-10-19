import { NextResponse, type NextRequest } from "next/server";
import { apiAuth } from "@/lib/auth/api";
import { can } from "@/lib/auth/permissions";
import { friendlyError } from "@/lib/forms";
import { extractTable, MAX_IMPORT_BYTES, readWorkbook } from "@/lib/import/parse";
import { createBatch } from "@/lib/import/service";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Upload a spreadsheet. Without `sheet`: returns the sheets and a preview so the user can pick one.
 * With `sheet`: stores the batch and raw rows and returns its id.
 */
export async function POST(req: NextRequest) {
  const auth = await apiAuth();
  if (auth instanceof NextResponse) return auth;
  if (!rateLimit(`import:${auth.user.id}`, 30, 10 * 60_000).ok) return NextResponse.json({ error: "Too many uploads. Wait a few minutes." }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const parishId = String(form?.get("parishId") ?? "");
  const sheet = form?.get("sheet") ? String(form.get("sheet")) : null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (!can(auth.access, "runImport", parishId)) return NextResponse.json({ error: "You can't import for this parish." }, { status: 403 });
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: "That file is bigger than 10 MB." }, { status: 413 });
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return NextResponse.json({ error: "Upload an .xlsx, .xls or .csv file." }, { status: 415 });

  let sheets;
  try {
    sheets = readWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch {
    return NextResponse.json({ error: "We couldn't read that file. Save it again as .xlsx or .csv and retry." }, { status: 422 });
  }

  if (!sheet) {
    return NextResponse.json({
      sheets: sheets.map((s) => {
        const t = extractTable(s.rows);
        return { name: s.name, rowCount: t.dataRows.length, headers: t.headers.slice(0, 12), preview: t.dataRows.slice(0, 3).map((r) => r.cells.slice(0, 12)) };
      }),
    });
  }
  const chosen = sheets.find((s) => s.name === sheet);
  if (!chosen) return NextResponse.json({ error: "That sheet isn't in the file." }, { status: 400 });
  try {
    const batchId = await createBatch(auth.access, auth.user.id, parishId, file.name, chosen.name, extractTable(chosen.rows));
    return NextResponse.json({ batchId });
  } catch (err) {
    return NextResponse.json({ error: friendlyError(err) }, { status: 400 });
  }
}
