import { NextResponse } from "next/server";
import { clearReview, setReview } from "@/lib/db";

export const runtime = "nodejs";

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.slice(0, 4000) : "";
  const images = Array.isArray(body.images)
    ? body.images.filter((u: unknown): u is string => typeof u === "string").slice(0, 12)
    : [];

  if (!note.trim() && images.length === 0) {
    return NextResponse.json({ error: "note or image required" }, { status: 400 });
  }

  const row = await setReview(id, note, images);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ link: row });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const row = await clearReview(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ link: row });
}
