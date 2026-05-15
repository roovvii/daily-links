// Wipes all links + events. Run with: npm run db:wipe
// Resets the SERIAL identity sequences so new rows start at id 1.
// Leaves the last_seen table alone (it just holds per-role badge timestamps).
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

  const linksBefore = (await sql`SELECT COUNT(*)::int AS count FROM links`) as unknown as { count: number }[];
  const eventsBefore = (await sql`SELECT COUNT(*)::int AS count FROM events`) as unknown as { count: number }[];
  console.log(`Before: ${linksBefore[0].count} links, ${eventsBefore[0].count} events`);

  // TRUNCATE with CASCADE handles the events -> links foreign key.
  // RESTART IDENTITY resets the SERIAL sequences so the next link gets id 1.
  await sql`TRUNCATE events, links RESTART IDENTITY CASCADE`;

  const linksAfter = (await sql`SELECT COUNT(*)::int AS count FROM links`) as unknown as { count: number }[];
  const eventsAfter = (await sql`SELECT COUNT(*)::int AS count FROM events`) as unknown as { count: number }[];
  console.log(`After:  ${linksAfter[0].count} links, ${eventsAfter[0].count} events`);
  console.log("Done. The app is empty and ready for fresh data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
