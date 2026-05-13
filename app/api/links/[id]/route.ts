import { NextResponse } from "next/server";
import { deleteLink, updateLink } from "@/lib/db";
import type { LinkStatus } from "@/lib/types";
import { STATUS_OPTIONS } from "@/lib/types";

export const runtime = "nodejs";

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: {
    status?: LinkStatus;
    notes?: string | null;
    company?: string | null;
    title?: string | null;
  } = {};
  if (typeof body.status === "string" && (STATUS_OPTIONS as string[]).includes(body.status)) {
    patch.status = body.status as LinkStatus;
  }
  if ("notes" in body) patch.notes = body.notes === null ? null : String(body.notes);
  if ("company" in body) patch.company = body.company === null ? null : String(body.company);
  if ("title" in body) patch.title = body.title === null ? null : String(body.title);

  const row = await updateLink(id, patch);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ link: row });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await deleteLink(id);
  return NextResponse.json({ ok: true });
}
