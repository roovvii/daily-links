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

  const before = (await sql`
    SELECT status, COUNT(*)::int AS count
    FROM links
    WHERE status NOT IN ('todo', 'applied')
    GROUP BY status
    ORDER BY status
  `) as unknown as { status: string; count: number }[];

  if (before.length === 0) {
    console.log("No rows to migrate. Status column is already todo/applied only.");
    return;
  }

  console.log("Folding the following rows into 'applied':");
  for (const row of before) console.log(`  ${row.status}: ${row.count}`);

  const result = (await sql`
    UPDATE links
    SET status = 'applied', updated_at = NOW()
    WHERE status NOT IN ('todo', 'applied')
    RETURNING id
  `) as unknown as { id: number }[];

  console.log(`Migrated ${result.length} row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
