import { neon } from "@neondatabase/serverless";
import type { LinkRow, LinkStatus } from "./types";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export async function listLinks(): Promise<LinkRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, url, company, title, source, status, notes,
           created_at, updated_at, completed_at
    FROM links
    ORDER BY
      CASE status WHEN 'todo' THEN 0 ELSE 1 END,
      created_at DESC
  `) as unknown as LinkRow[];
  return rows;
}

export async function createLink(input: {
  url: string;
  company: string | null;
  title: string | null;
  source: string | null;
}): Promise<LinkRow | null> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO links (url, company, title, source, status)
    VALUES (${input.url}, ${input.company}, ${input.title}, ${input.source}, 'todo')
    ON CONFLICT (url) DO NOTHING
    RETURNING id, url, company, title, source, status, notes,
              created_at, updated_at, completed_at
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function updateLink(
  id: number,
  patch: { status?: LinkStatus; notes?: string | null; company?: string | null; title?: string | null }
): Promise<LinkRow | null> {
  const sql = getSql();
  const status = patch.status ?? null;
  const completedAt = patch.status && patch.status !== "todo" ? new Date().toISOString() : null;
  const rows = (await sql`
    UPDATE links
    SET
      status = COALESCE(${status}, status),
      notes = COALESCE(${patch.notes ?? null}, notes),
      company = COALESCE(${patch.company ?? null}, company),
      title = COALESCE(${patch.title ?? null}, title),
      completed_at = CASE
        WHEN ${status}::text IS NULL THEN completed_at
        WHEN ${status}::text = 'todo' THEN NULL
        ELSE ${completedAt}::timestamptz
      END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, url, company, title, source, status, notes,
              created_at, updated_at, completed_at
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function deleteLink(id: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM links WHERE id = ${id}`;
}
