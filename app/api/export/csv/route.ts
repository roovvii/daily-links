import { listLinks } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const rows = await listLinks();
  const headers = [
    "id",
    "company",
    "title",
    "url",
    "source",
    "status",
    "notes",
    "needs_review",
    "review_note",
    "snoozed_until",
    "created_at",
    "completed_at",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.company,
        r.title,
        r.url,
        r.source,
        r.status,
        r.notes,
        r.needs_review,
        r.review_note,
        r.snoozed_until,
        r.created_at,
        r.completed_at,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  const body = lines.join("\n");
  const filename = `daily-links-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
