import { TEMPLATE_HEADERS } from "@/lib/import/fields";

export function GET() {
  const body = TEMPLATE_HEADERS.join(",") + "\n" + "18/10/2026,Sunday 1st Service,150,180,40,370,5,30,250000,450000,,,\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="past-services-template.csv"',
    },
  });
}
