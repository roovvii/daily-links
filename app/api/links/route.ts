import { NextResponse } from "next/server";
import {
  createLink,
  deleteStaleActiveLinks,
  insertEvent,
  insertEventsBulk,
  listLinks,
} from "@/lib/db";
import { parseLink, splitUrls } from "@/lib/parser";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

// Windows the bulk-delete is allowed to operate on. Restricting to these
// values keeps the endpoint from being coerced into a mass wipe.
const ALLOWED_DELETE_DAYS = new Set([4, 7]);

export async function GET() {
  const rows = await listLinks();
  return NextResponse.json({ links: rows });
}

export async function POST(req: Request) {
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const raw = typeof body.text === "string" ? body.text : "";
  const urls = splitUrls(raw);
  if (urls.length === 0) {
    return NextResponse.json({ error: "No valid URLs found" }, { status: 400 });
  }

  const parsed = await Promise.all(urls.map((u) => parseLink(u)));
  const created = [];
  let skipped = 0;
  for (const p of parsed) {
    const row = await createLink({
      url: p.url,
      company: p.company,
      title: p.title,
      source: p.source,
    });
    if (row) created.push(row);
    else skipped++;
  }
  if (created.length > 0) {
    await insertEventsBulk(role, "added", created.map((c) => c.id));
  }
  return NextResponse.json({ created, skipped });
}

export async function DELETE(req: Request) {
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (role !== "ravi") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const days = Number(new URL(req.url).searchParams.get("days"));
  if (!ALLOWED_DELETE_DAYS.has(days)) {
    return NextResponse.json({ error: "days must be 4 or 7" }, { status: 400 });
  }

  const ids = await deleteStaleActiveLinks(days);
  if (ids.length > 0) {
    await insertEvent(role, "deleted", null);
  }
  return NextResponse.json({ deleted: ids.length, ids });
}
