import { NextResponse } from "next/server";
import {
  createLink,
  deleteStaleActiveLinks,
  insertEvent,
  insertEventsBulk,
  listLinks,
} from "@/lib/db";
import { parseBlocks, parseLink, sourceForUrl } from "@/lib/parser";
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
  const blocks = parseBlocks(raw);
  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "No valid URLs found. Each entry needs a line with an http(s) URL." },
      { status: 400 }
    );
  }

  // Only scrape the posting when the paste didn't already name the company
  // and the role. Pasted values win over scraped ones: the list was curated
  // by hand, and og:title is frequently just the site name.
  const parsed = await Promise.all(
    blocks.map(async (b) => {
      if (b.company && b.title) {
        return { ...b, source: sourceForUrl(b.url) };
      }
      const fetched = await parseLink(b.url);
      return {
        ...b,
        company: b.company ?? fetched.company,
        title: b.title ?? fetched.title,
        source: fetched.source,
      };
    })
  );

  const created = [];
  let skipped = 0;
  for (const p of parsed) {
    const row = await createLink({
      url: p.url,
      company: p.company,
      title: p.title,
      source: p.source,
      notes: p.notes,
      experienceText: p.experienceText,
      minYears: p.minYears,
      maxYears: p.maxYears,
      visa: p.visa,
      visaText: p.visaText,
      meta: p.meta,
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
