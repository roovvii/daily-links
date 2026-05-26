import { NextResponse } from "next/server";
import { deleteFaq } from "@/lib/db";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  // Any authenticated user can prune the shared FAQ list.
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  await deleteFaq(id);
  return NextResponse.json({ ok: true });
}
