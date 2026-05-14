import { NextResponse } from "next/server";
import { listDailyApplies } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("days") ?? "14");
  const days = Math.max(1, Math.min(365, Number.isFinite(raw) ? raw : 14));
  const rows = await listDailyApplies(days);
  return NextResponse.json({ daily: rows, days });
}
