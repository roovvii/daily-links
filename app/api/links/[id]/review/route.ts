import { NextResponse } from "next/server";
import { clearReview, insertEvent, setReview } from "@/lib/db";
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
  const note = typeof body.note === "string" ? body.note.slice(0, 4000) : "";
  const images = Array.isArray(body.images)
    ? body.images.filter((u: unknown): u is string => typeof u === "string").slice(0, 12)
    : [];

  if (!note.trim() && images.length === 0) {
    return NextResponse.json({ error: "note or image required" }, { status: 400 });
  }

  const wasFlagged = false; // We always treat this as a fresh flag for event purposes
  const row = await setReview(id, note, images);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!wasFlagged) {
    await insertEvent(role, "flagged", id);
  }
  return NextResponse.json({ link: row });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const row = await clearReview(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  await insertEvent(role, "reviewed", id);
  return NextResponse.json({ link: row });
}
