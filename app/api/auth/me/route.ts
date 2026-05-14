import { NextResponse } from "next/server";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const role = await getRoleFromRequest(req);
  return NextResponse.json({ role });
}
