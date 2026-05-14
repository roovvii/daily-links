import { NextResponse } from "next/server";
import { getLastSeen, listEventSessions, setLastSeen } from "@/lib/db";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const role = await getRoleFromRequest(req);
  const [sessions, lastSeen] = await Promise.all([
    listEventSessions(40),
    role ? getLastSeen(role) : Promise.resolve(null),
  ]);
  return NextResponse.json({ sessions, lastSeen });
}

export async function POST(req: Request) {
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seenAt = await setLastSeen(role);
  return NextResponse.json({ seenAt });
}
