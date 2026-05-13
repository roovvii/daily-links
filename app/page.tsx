import { listLinks } from "@/lib/db";
import { LinksApp } from "./_components/LinksApp";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initial = [] as Awaited<ReturnType<typeof listLinks>>;
  let dbError: string | null = null;
  try {
    initial = await listLinks();
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
  }
  return <LinksApp initial={initial} dbError={dbError} />;
}
