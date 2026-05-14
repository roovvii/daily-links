import { NextResponse } from "next/server";
import { getApplyCountsInRange } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isIso(s: string): boolean {
  return !Number.isNaN(new Date(s).getTime());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  let from = url.searchParams.get("from");
  let to = url.searchParams.get("to");

  if (!from || !to || !isIso(from) || !isIso(to)) {
    // Fallback to UTC day if client didn't supply a range.
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);
    from = start.toISOString();
    to = end.toISOString();
  }

  const rows = await getApplyCountsInRange(from, to);
  const counts: Record<string, number> = { ravi: 0, sreeya: 0 };
  for (const r of rows) {
    counts[r.role] = r.count;
  }
  return NextResponse.json({ counts, from, to });
}
