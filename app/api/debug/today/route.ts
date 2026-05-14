// Temporary diagnostic endpoint for the "Applied today" counter.
// Returns: the live count, schema info, and the latest few apply events
// the SQL filter is considering. Remove once the counter bug is fixed.
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getRoleFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export async function GET(req: Request) {
  const role = await getRoleFromRequest(req);
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sql = getSql();

  // 1) The production count + alternative definitions so we can see which
  // one (if any) updates correctly when a fresh link is checked.
  const counts_optionB = await sql`
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
  `;
  // Without the l.status filter (distinct apply events today)
  const counts_optionA = await sql`
    SELECT role, COUNT(DISTINCT link_id)::int AS count
    FROM events
    WHERE type = 'applied'
      AND link_id IS NOT NULL
      AND (
        (role = 'ravi'
          AND (created_at AT TIME ZONE 'America/Chicago')::date
              = (NOW() AT TIME ZONE 'America/Chicago')::date)
        OR
        (role = 'sreeya'
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date
              = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)
      )
    GROUP BY role
  `;
  // Raw apply events today (no DISTINCT, no status filter)
  const counts_raw = await sql`
    SELECT role, COUNT(*)::int AS count
    FROM events
    WHERE type = 'applied'
      AND (
        (role = 'ravi'
          AND (created_at AT TIME ZONE 'America/Chicago')::date
              = (NOW() AT TIME ZONE 'America/Chicago')::date)
        OR
        (role = 'sreeya'
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date
              = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)
      )
    GROUP BY role
  `;

  // The full list of link_ids contributing to the production count for the
  // calling role, with each link's current status. Lets us see whether a
  // freshly-checked link actually joins the set or was already in it.
  const contributingLinks = await sql`
    SELECT DISTINCT e.link_id, l.status, l.company, l.title,
                    MAX(e.created_at)::text AS most_recent_event_at
    FROM events e
    JOIN links l ON l.id = e.link_id
    WHERE e.type = 'applied'
      AND l.status = 'applied'
      AND e.role = ${role}
      AND (e.created_at AT TIME ZONE ${role === "ravi" ? "America/Chicago" : "Asia/Kolkata"})::date
          = (NOW() AT TIME ZONE ${role === "ravi" ? "America/Chicago" : "Asia/Kolkata"})::date
    GROUP BY e.link_id, l.status, l.company, l.title
    ORDER BY most_recent_event_at DESC
  `;

  // 2) The 5 most recent applied events for the calling role, joined with
  // their link's current status. Includes the raw created_at and the
  // TZ-converted date so we can see if the filter matches.
  const tz = role === "ravi" ? "America/Chicago" : "Asia/Kolkata";
  const recent = await sql`
    SELECT
      e.id AS event_id,
      e.role,
      e.type,
      e.link_id,
      e.created_at::text AS created_at_raw,
      (e.created_at AT TIME ZONE ${tz})::date::text AS event_local_date,
      (NOW() AT TIME ZONE ${tz})::date::text AS server_local_date,
      l.status AS link_status,
      l.company AS link_company,
      l.title AS link_title
    FROM events e
    LEFT JOIN links l ON l.id = e.link_id
    WHERE e.role = ${role}
      AND e.type = 'applied'
    ORDER BY e.created_at DESC
    LIMIT 5
  `;

  // 3) Schema for events.created_at and a couple of other key columns.
  const schema = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'events'
    ORDER BY ordinal_position
  `;

  // 4) Server's current understanding of "now".
  const now = await sql`
    SELECT
      NOW()::text AS now_utc,
      (NOW() AT TIME ZONE 'America/Chicago')::text AS now_chicago,
      (NOW() AT TIME ZONE 'Asia/Kolkata')::text AS now_kolkata,
      current_setting('TimeZone') AS session_tz
  `;

  return NextResponse.json({
    role,
    counts_optionB,
    counts_optionA,
    counts_raw,
    contributing_links_for_role: contributingLinks,
    recent_events_for_role: recent,
    events_table_schema: schema,
    now,
    server_time_when_query_ran: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
