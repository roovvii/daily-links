import { NextResponse } from "next/server";
import { getTodayApplyCounts } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getTodayApplyCounts();
  const counts: Record<string, number> = { ravi: 0, sreeya: 0 };
  for (const r of rows) {
    counts[r.role] = r.count;
  }
  return NextResponse.json({ counts });
}
