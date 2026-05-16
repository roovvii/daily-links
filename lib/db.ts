import { neon, neonConfig } from "@neondatabase/serverless";
import type { LinkRow, LinkStatus } from "./types";

// Neon's serverless driver issues SQL queries via fetch(). On Vercel, fetch()
// goes through Next.js's Data Cache by default and caches responses by URL +
// body — which means every SQL query string gets a long-lived cache entry,
// freezing results across requests. Override fetch to opt out so every query
// hits the database fresh.
neonConfig.fetchFunction = (url: RequestInfo | URL, options?: RequestInit) =>
  fetch(url, { ...options, cache: "no-store" });

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
           needs_review, review_note, review_images, review_flagged_at,
           snoozed_until
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
    RETURNING *
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function updateLink(
  id: number,
  patch: { status?: LinkStatus; notes?: string | null; company?: string | null; title?: string | null }
): Promise<LinkRow | null> {
  const sql = getSql();
  const status = patch.status ?? null;
  // completed_at means "when the application was submitted", so it only
  // gets set when status transitions to 'applied'. Both 'todo' and
  // 'dropped' clear it (dropped means the user gave up on submitting).
  const completedAt = patch.status === "applied" ? new Date().toISOString() : null;
  const rows = (await sql`
    UPDATE links
    SET
      status = COALESCE(${status}, status),
      notes = COALESCE(${patch.notes ?? null}, notes),
      company = COALESCE(${patch.company ?? null}, company),
      title = COALESCE(${patch.title ?? null}, title),
      completed_at = CASE
        WHEN ${status}::text IS NULL THEN completed_at
        WHEN ${status}::text = 'applied' THEN ${completedAt}::timestamptz
        ELSE NULL
      END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function getLinkReviewState(id: number): Promise<boolean | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT needs_review FROM links WHERE id = ${id}
  `) as unknown as { needs_review: boolean }[];
  return rows[0] ? rows[0].needs_review : null;
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
    RETURNING *
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
    RETURNING *
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

// Clear the review flag and set the link's status to 'applied' in a single
// UPDATE so the "Reviewed & applied" admin action is one round-trip.
export async function clearReviewAndApply(id: number): Promise<LinkRow | null> {
  const sql = getSql();
  const completedAt = new Date().toISOString();
  const rows = (await sql`
    UPDATE links
    SET
      needs_review = FALSE,
      review_note = NULL,
      review_images = NULL,
      review_flagged_at = NULL,
      status = 'applied',
      completed_at = ${completedAt}::timestamptz,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function deleteLink(id: number): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM links WHERE id = ${id}`;
}

export async function setSnooze(
  id: number,
  until: string
): Promise<LinkRow | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE links
    SET snoozed_until = ${until}::timestamptz, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export async function clearSnooze(id: number): Promise<LinkRow | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE links
    SET snoozed_until = NULL, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as unknown as LinkRow[];
  return rows[0] ?? null;
}

export type DailyApplyRow = { role: string; day: string; count: number };

export type TodayCount = { role: string; count: number };

export async function getTodayApplyCounts(): Promise<TodayCount[]> {
  const sql = getSql();
  // "Applied today" = distinct links that are currently checked (status =
  // 'applied') AND have an 'applied' event today in the role's own
  // timezone. This makes the counter match what's visibly checked: it
  // goes up when you check, down when you uncheck, back up when you
  // re-check. The JOIN against links also drops events whose link was
  // since deleted.
  const rows = (await sql`
    SELECT e.role, COUNT(DISTINCT e.link_id)::int AS count
    FROM events e
    JOIN links l ON l.id = e.link_id
    WHERE e.type = 'applied'
      AND l.status = 'applied'
      AND (
        (e.role = 'ravi'
          AND (e.created_at AT TIME ZONE 'America/Chicago')::date
              = (NOW() AT TIME ZONE 'America/Chicago')::date)
        OR
        (e.role = 'sreeya'
          AND (e.created_at AT TIME ZONE 'Asia/Kolkata')::date
              = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)
      )
    GROUP BY e.role
  `) as unknown as TodayCount[];
  return rows;
}

export async function listDailyApplies(days = 14): Promise<DailyApplyRow[]> {
  const sql = getSql();
  // Bucket each role's events by that role's own local calendar date so the
  // chart agrees with the per-role 'Applied today' tile. The WHERE filter is
  // still UTC-based and intentionally loose (it just bounds the scan).
  // COUNT(DISTINCT link_id) so re-toggling the same link doesn't double-count.
  const rows = (await sql`
    SELECT role,
           to_char(
             date_trunc(
               'day',
               created_at AT TIME ZONE (
                 CASE role
                   WHEN 'ravi' THEN 'America/Chicago'
                   WHEN 'sreeya' THEN 'Asia/Kolkata'
                   ELSE 'UTC'
                 END
               )
             ),
             'YYYY-MM-DD'
           ) AS day,
           COUNT(DISTINCT link_id)::int AS count
    FROM events
    WHERE type = 'applied'
      AND link_id IS NOT NULL
      AND created_at >= NOW() - ((${days} + 1) || ' days')::interval
    GROUP BY role, day
    ORDER BY day ASC, role ASC
  `) as unknown as DailyApplyRow[];
  return rows;
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

// A comment is stored as an event with type='commented' and the text in the
// note column, so it shows up in the per-link history feed alongside other
// activity and counts toward Recent updates aggregation.
export async function insertComment(
  role: string,
  linkId: number,
  text: string
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO events (role, type, link_id, note)
    VALUES (${role}, 'commented', ${linkId}, ${text})
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
  // Bound the scan to the last 90 days. The sidebar only ever shows the
  // most recent ~40 sessions, so older events would be discarded anyway,
  // and the unbounded scan would grow linearly with table size.
  const rows = (await sql`
    WITH ordered AS (
      SELECT id, role, type, created_at,
        LAG(created_at) OVER (PARTITION BY role, type ORDER BY created_at) AS prev_at
      FROM events
      WHERE created_at >= NOW() - INTERVAL '90 days'
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
  note: string | null;
};

export async function listEventsForLink(linkId: number): Promise<LinkEventRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT role, type, created_at::text AS created_at, note
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
