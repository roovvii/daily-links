import { NextResponse } from "next/server";
import { insertComment } from "@/lib/db";
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
  const raw = typeof body.text === "string" ? body.text.trim() : "";
  if (!raw) {
    return NextResponse.json({ error: "comment text required" }, { status: 400 });
  }
  // Cap comment length so the events table doesn't grow unbounded per row.
  const text = raw.slice(0, 4000);

  await insertComment(role, id, text);
  return NextResponse.json({ ok: true });
}
