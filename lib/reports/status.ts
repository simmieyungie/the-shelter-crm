import type { Tone } from "@/components/app/status-pill";
import type { RecordSource, ReportStatus } from "@/lib/db/schema";

export function reportPill(status: ReportStatus, source: RecordSource): [Tone, string] {
  switch (status) {
    case "DRAFT":
      return ["warning", "Draft"];
    case "SUBMITTED":
      return source === "IMPORT" ? ["brand", "Imported · check"] : ["warning", "Awaiting pastor"];
    case "REOPENED":
      return ["warning", "Reopened"];
    case "VERIFIED":
      return ["success", "Verified"];
  }
}

/** Total attendance is unknown when any part is unknown (never treat NULL as 0). */
export function totalAttendance(r: { men: number | null; women: number | null; children: number | null }): number | null {
  return r.men === null || r.women === null || r.children === null ? null : r.men + r.women + r.children;
}
