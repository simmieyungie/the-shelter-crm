"use client";

import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SheetInfo = { name: string; rowCount: number; headers: string[]; preview: (string | number | boolean | null)[][] };

export function UploadStep({ parishId }: { parishId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null);
  const [sheet, setSheet] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(f: File, sheetName?: string) {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("parishId", parishId);
    if (sheetName) fd.set("sheet", sheetName);
    const res = await fetch("/api/v1/imports", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({ error: "Upload failed." }));
    if (!res.ok) throw new Error(body.error ?? "Upload failed.");
    return body;
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    setError(null);
    setSheets(null);
    if (f.size > 10 * 1024 * 1024) return setError("That file is bigger than 10 MB.");
    setFile(f);
    setBusy(true);
    try {
      const body = (await post(f)) as { sheets: SheetInfo[] };
      const usable = body.sheets.filter((s) => s.rowCount > 0);
      setSheets(body.sheets);
      setSheet((usable[0] ?? body.sheets[0])?.name ?? "");
      if (body.sheets.length === 1 && usable.length === 1) await start(f, usable[0].name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start(f: File, sheetName: string) {
    setBusy(true);
    setError(null);
    try {
      const body = (await post(f, sheetName)) as { batchId: string };
      router.push(`/reports/import/${body.batchId}?step=map`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void choose(e.dataTransfer.files?.[0]);
        }}
        className="rounded-2xl border-2 border-dashed border-line bg-surface p-6 text-center"
      >
        <FileSpreadsheet className="mx-auto size-10 text-brand" aria-hidden />
        <p className="mt-2 font-semibold">Choose your spreadsheet</p>
        <p className="text-sm text-subtle">.xlsx, .xls or .csv, up to 10 MB. Nothing is saved to reports until you confirm.</p>
        <input ref={inputRef} id="file" type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} aria-label="Spreadsheet file" />
        <Button type="button" className="mt-4 h-11" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" aria-hidden /> {busy ? "Reading…" : file ? "Choose a different file" : "Choose file"}
        </Button>
        {file && <p className="mt-2 text-sm text-ink">{file.name}</p>}
      </div>
      <a href="/api/v1/imports/template" className="inline-flex items-center gap-2 text-sm font-medium text-brand underline">
        <Download className="size-4" aria-hidden /> Download a blank template
      </a>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      {sheets && sheets.length > 1 && file && (
        <fieldset className="rounded-2xl border border-line bg-surface p-4">
          <legend className="px-1 text-sm font-semibold">Which sheet has the services?</legend>
          <div className="mt-2 space-y-2">
            {sheets.map((s) => (
              <label key={s.name} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", sheet === s.name ? "border-brand bg-brand-soft" : "border-line")}>
                <input type="radio" name="sheet" value={s.name} checked={sheet === s.name} onChange={() => setSheet(s.name)} className="mt-1 size-4 accent-[var(--brand)]" />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {s.name} <span className="font-normal text-subtle">· {s.rowCount} rows</span>
                  </span>
                  <span className="block truncate text-xs text-subtle">{s.headers.join(" · ")}</span>
                </span>
              </label>
            ))}
          </div>
          <Button className="mt-3 h-11" disabled={busy || !sheet} onClick={() => start(file, sheet)}>
            {busy ? "Preparing…" : "Use this sheet"}
          </Button>
        </fieldset>
      )}
    </div>
  );
}
