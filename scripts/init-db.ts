import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }
  const sql = neon(url);
  console.log("Creating links table if missing...");
  await sql`
    CREATE TABLE IF NOT EXISTS links (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      company TEXT,
      title TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      needs_review BOOLEAN NOT NULL DEFAULT FALSE,
      review_note TEXT,
      review_images JSONB,
      review_flagged_at TIMESTAMPTZ,
      snoozed_until TIMESTAMPTZ
    )
  `;
  // Posting details parsed out of pasted blocks (Role/Experience/Visa lines).
  // Idempotent so databases created before the feature pick them up; lib/db.ts
  // applies the same set at runtime for deploys that never run this script.
  await sql`ALTER TABLE links ADD COLUMN IF NOT EXISTS experience_text TEXT`;
  await sql`ALTER TABLE links ADD COLUMN IF NOT EXISTS min_years INT`;
  await sql`ALTER TABLE links ADD COLUMN IF NOT EXISTS max_years INT`;
  await sql`ALTER TABLE links ADD COLUMN IF NOT EXISTS visa TEXT NOT NULL DEFAULT 'unknown'`;
  await sql`ALTER TABLE links ADD COLUMN IF NOT EXISTS visa_text TEXT`;
  await sql`ALTER TABLE links ADD COLUMN IF NOT EXISTS meta JSONB`;

  await sql`CREATE INDEX IF NOT EXISTS links_status_idx ON links (status)`;
  await sql`CREATE INDEX IF NOT EXISTS links_created_at_idx ON links (created_at DESC)`;

  console.log("Creating events table if missing...");
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      type TEXT NOT NULL,
      link_id INT REFERENCES links(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      note TEXT
    )
  `;
  // Idempotent migration: tables created before the comment feature was
  // added need the note column to be added in place.
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS note TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS events_role_type_created_idx ON events (role, type, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS events_type_created_idx ON events (type, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS events_link_id_idx ON events (link_id)`;

  console.log("Creating last_seen table if missing...");
  await sql`
    CREATE TABLE IF NOT EXISTS last_seen (
      role TEXT PRIMARY KEY,
      seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log("Creating faqs table if missing...");
  await sql`
    CREATE TABLE IF NOT EXISTS faqs (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
