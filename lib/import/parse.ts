import * as XLSX from "xlsx";
import { matchHeader } from "./fields";

export type Cell = string | number | boolean | null;
export type SheetData = { name: string; rows: Cell[][] };

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

/** Reads every sheet as a grid of raw cell values (numbers stay numbers, so Excel dates arrive as serials). */
export function readWorkbook(data: ArrayBuffer | Uint8Array, fileName = ""): SheetData[] {
  const isCsv = /\.csv$/i.test(fileName);
  const wb = XLSX.read(data, { type: "array", cellDates: false, raw: isCsv ? true : undefined, dense: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Cell[][];
    return { name, rows: rows.slice(0, MAX_IMPORT_ROWS + 20) };
  });
}

const nonEmpty = (row: Cell[]) => row.filter((c) => c !== null && String(c).trim() !== "");

/**
 * Finds the header row: the first of the top 15 rows where at least two cells look like known
 * headers. Title rows (often merged cells) above it are ignored. Falls back to the first row with
 * three or more text cells.
 */
export function detectHeaderRow(rows: Cell[][]): number {
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const hits = (rows[i] ?? []).filter((c) => typeof c === "string" && matchHeader(c).confidence !== "none").length;
    if (hits >= 2) return i;
  }
  for (let i = 0; i < limit; i++) {
    if (nonEmpty(rows[i] ?? []).filter((c) => typeof c === "string").length >= 3) return i;
  }
  return 0;
}

export type ExtractedSheet = {
  headerRowIndex: number;
  headers: string[];
  /** rowNumber is the 1-based row number as the user sees it in Excel. */
  dataRows: { rowNumber: number; cells: Cell[] }[];
};

export function extractTable(rows: Cell[][]): ExtractedSheet {
  const headerRowIndex = detectHeaderRow(rows);
  const headerRow = rows[headerRowIndex] ?? [];
  const width = Math.max(headerRow.length, ...rows.slice(headerRowIndex + 1, headerRowIndex + 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = headerRow[i];
    return h === null || h === undefined || String(h).trim() === "" ? `Column ${XLSX.utils.encode_col(i)}` : String(h).trim();
  });
  const dataRows: ExtractedSheet["dataRows"] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cells = Array.from({ length: width }, (_, c) => rows[i]?.[c] ?? null);
    if (nonEmpty(cells).length === 0) continue;
    dataRows.push({ rowNumber: i + 1, cells });
  }
  return { headerRowIndex, headers, dataRows: dataRows.slice(0, MAX_IMPORT_ROWS) };
}

/** Excel serial date -> ISO date (1900 date system, including the Lotus leap-year bug handled by SheetJS). */
export function excelSerialToIso(serial: number): string | null {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d || !d.y) return null;
  return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}
