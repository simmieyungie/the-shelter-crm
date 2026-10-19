/* Generates the importer fixtures in tests/fixtures/imports/. Run: pnpm exec tsx scripts/make-import-fixtures.ts */
import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const dir = "tests/fixtures/imports";
mkdirSync(dir, { recursive: true });

function serial(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
}
const D = (iso: string) => ({ t: "n", v: serial(iso), z: "dd/mm/yyyy" });

// Messy register: two merged title rows, a blank row, odd headers, mixed dates and junk values.
const messy: unknown[][] = [
  ["SHELTER PARISH — SUNDAY ATTENDANCE REGISTER 2026"],
  ["Compiled by the Secretary"],
  [],
  ["S/N", "DATE", "Service", "Male", "Female", "Kids", "TOTAL", "New comers", "Offering (₦)", "Tithes", "Thanksgiving", "Remarks"],
  [1, D("2026-03-01"), "Sunday 1st Service", 150, 180, 40, 370, 5, 250000, "450,000", null, "Communion Sunday"],
  [2, D("2026-03-01"), "sunday 2nd service", 200, 230, "N/A", null, 3, "310,500.50", 600000, 50000, null],
  [3, D("2026-03-08"), "Sunday 1st Service", "-", 175, 38, null, 2, 240000, 420000, null, null],
  [4, D("2026-03-08"), "Sunday 1st Service", 151, 176, 39, 366, 2, 240000, 420000, null, "typed twice"],
  [5, D("2026-03-10"), "Youth Service", 40, 55, 0, 95, 6, 30000, null, null, null],
  [6, D("2026-03-11"), "Accelerate", 60, 80, 5, 145, 1, 45000, 90000, null, "held on Wednesday?"],
  [7, "15/03/2026", "Sunday 1st Service", 100, 100, 20, 230, 4, 200000, 380000, null, null],
  [8, D("2030-01-06"), "Sunday 1st Service", 1, 1, 1, 3, 0, 0, 0, 0, "future"],
  [9, D("2026-03-22"), "Sunday 1st Service", 140, null, 35, null, "nil", 210000, 400000, null, null],
  [10, D("2026-03-15"), "Sunday 2nd Service", 190, 220, 30, 440, 1, 280000, 500000, null, null],
  [11, D("2026-03-15"), "Sunday 2nd Service", 90, 110, 12, 212, 0, 120000, 150000, null, "evening repeat"],
  ["TOTAL", null, null, 1121, 1323, 219, null, 24, null, null, null, null],
];
const ws = XLSX.utils.aoa_to_sheet(messy as XLSX.CellObject[][]);
ws["!merges"] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "2026");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Notes"], ["Nothing to import here"]]), "Notes");
writeFileSync(`${dir}/messy-register.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

// Clean CSV in the canonical template layout, DD/MM/YYYY text dates.
const csv = [
  "Date,Service,Men,Women,Children,Total,First timers,Workers on duty,Offering,Tithe,Special seed,Preacher,Notes",
  "05/04/2026,Sunday 1st Service,155,182,41,378,4,30,\"260,000\",470000,,Pastor Segun,",
  "07/04/2026,Accelerate,58,77,6,141,2,15,42000,88000,,,",
  "12/04/2026,Sunday 1st Service,149,170,37,356,,28,250000,455000,10000,,",
].join("\n");
writeFileSync(`${dir}/template-style.csv`, csv);

console.log("Fixtures written to", dir);
