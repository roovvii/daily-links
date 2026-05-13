import { NextResponse } from "next/server";
import { createLink, listLinks } from "@/lib/db";
import { parseLink, splitUrls } from "@/lib/parser";

export const runtime = "nodejs";

export async function GET() {
  const rows = await listLinks();
  return NextResponse.json({ links: rows });
}

export async function POST(req: Request) {
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
  return NextResponse.json({ created, skipped });
}
