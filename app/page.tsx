import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { AUTH_COOKIE, verifyAuthToken, type Role } from "@/lib/auth";
import { listLinks } from "@/lib/db";
import { LinksApp } from "./_components/LinksApp";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function HomePage() {
  noStore();
  const token = cookies().get(AUTH_COOKIE)?.value;
  const role: Role = (await verifyAuthToken(token)) ?? "ravi";

  let initial: Awaited<ReturnType<typeof listLinks>> = [];
  let dbError: string | null = null;
  try {
    initial = await listLinks();
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database error";
    console.error("[page] listLinks failed:", err);
  }
  return <LinksApp initial={initial} dbError={dbError} role={role} />;
}
