import { NextResponse } from "next/server";
import { clearSnooze, insertEvent, setSnooze } from "@/lib/db";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const until = typeof body.until === "string" ? body.until : null;
  if (!until) return NextResponse.json({ error: "until required" }, { status: 400 });
  const date = new Date(until);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return NextResponse.json({ error: "until must be a future date" }, { status: 400 });
  }

  const row = await setSnooze(id, date.toISOString());
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  await insertEvent(role, "snoozed", id);
  return NextResponse.json({ link: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const row = await clearSnooze(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  await insertEvent(role, "unsnoozed", id);
  return NextResponse.json({ link: row });
}
