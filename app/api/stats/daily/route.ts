import { NextResponse } from "next/server";
import { listDailyApplies } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listDailyApplies(14);
  return NextResponse.json({ daily: rows });
}
