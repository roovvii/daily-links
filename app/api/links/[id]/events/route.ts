import { NextResponse } from "next/server";
import { listEventsForLink } from "@/lib/db";

export const runtime = "nodejs";

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const events = await listEventsForLink(id);
  return NextResponse.json({ events });
}
