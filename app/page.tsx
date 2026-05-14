import { unstable_noStore as noStore } from "next/cache";
import { listLinks } from "@/lib/db";
import { LinksApp } from "./_components/LinksApp";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function HomePage() {
  noStore();
  let initial: Awaited<ReturnType<typeof listLinks>> = [];
  let dbError: string | null = null;
  try {
    initial = await listLinks();
    console.log(`[page] listLinks returned ${initial.length} rows`);
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
    console.error("[page] listLinks failed:", err);
  }
  return <LinksApp initial={initial} dbError={dbError} />;
}
