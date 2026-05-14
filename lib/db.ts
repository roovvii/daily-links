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
           created_at, updated_at, completed_at,
           needs_review, review_note, review_images, review_flagged_at
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
              created_at, updated_at, completed_at,
              needs_review, review_note, review_images, review_flagged_at
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
              created_at, updated_at, completed_at,
              needs_review, review_note, review_images, review_flagged_at
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function setReview(
  id: number,
  note: string,
  images: string[]
): Promise<LinkRow | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE links
    SET
      needs_review = TRUE,
      review_note = ${note},
      review_images = ${JSON.stringify(images)}::jsonb,
      review_flagged_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, url, company, title, source, status, notes,
              created_at, updated_at, completed_at,
              needs_review, review_note, review_images, review_flagged_at
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function clearReview(id: number): Promise<LinkRow | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE links
    SET
      needs_review = FALSE,
      review_note = NULL,
      review_images = NULL,
      review_flagged_at = NULL,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, url, company, title, source, status, notes,
              created_at, updated_at, completed_at,
              needs_review, review_note, review_images, review_flagged_at
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function deleteLink(id: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM links WHERE id = ${id}`;
}

export async function insertEvent(
  role: string,
  type: string,
  linkId: number | null
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO events (role, type, link_id)
    VALUES (${role}, ${type}, ${linkId})
  `;
}

export async function insertEventsBulk(
  role: string,
  type: string,
  linkIds: number[]
): Promise<void> {
  if (linkIds.length === 0) return;
  const sql = getSql();
  for (const id of linkIds) {
    await sql`
      INSERT INTO events (role, type, link_id)
      VALUES (${role}, ${type}, ${id})
    `;
  }
}

export type EventSessionRow = {
  role: string;
  type: string;
  count: number;
  start_at: string;
  end_at: string;
};

export async function listEventSessions(limit = 40): Promise<EventSessionRow[]> {
  const sql = getSql();
  const rows = (await sql`
    WITH ordered AS (
      SELECT id, role, type, created_at,
        LAG(created_at) OVER (PARTITION BY role, type ORDER BY created_at) AS prev_at
      FROM events
    ),
    marked AS (
      SELECT id, role, type, created_at,
        CASE WHEN prev_at IS NULL OR created_at - prev_at > interval '30 minutes' THEN 1 ELSE 0 END AS is_new
      FROM ordered
    ),
    sessioned AS (
      SELECT id, role, type, created_at,
        SUM(is_new) OVER (PARTITION BY role, type ORDER BY created_at) AS session_id
      FROM marked
    )
    SELECT role, type,
           COUNT(*)::int AS count,
           MIN(created_at)::text AS start_at,
           MAX(created_at)::text AS end_at
    FROM sessioned
    GROUP BY role, type, session_id
    ORDER BY MAX(created_at) DESC
    LIMIT ${limit}
  `) as unknown as EventSessionRow[];
  return rows;
}

export async function getLastSeen(role: string): Promise<string | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT seen_at FROM last_seen WHERE role = ${role}
  `) as unknown as { seen_at: string }[];
  return rows[0]?.seen_at ?? null;
}

export type LinkEventRow = {
  role: string;
  type: string;
  created_at: string;
};

export async function listEventsForLink(linkId: number): Promise<LinkEventRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT role, type, created_at::text AS created_at
    FROM events
    WHERE link_id = ${linkId}
    ORDER BY created_at ASC
  `) as unknown as LinkEventRow[];
  return rows;
}

export async function setLastSeen(role: string): Promise<string> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO last_seen (role, seen_at)
    VALUES (${role}, NOW())
    ON CONFLICT (role) DO UPDATE SET seen_at = NOW()
    RETURNING seen_at
  `) as unknown as { seen_at: string }[];
  return rows[0].seen_at;
}
