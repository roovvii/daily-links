import { NextResponse } from "next/server";
import { AUTH_COOKIE, ROLES, issueAuthToken, passwordMatches, type Role } from "@/lib/auth";

export const runtime = "nodejs";

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const role = isRole(body.role) ? body.role : null;
  const password = typeof body.password === "string" ? body.password : "";
  if (!role) {
    return NextResponse.json({ error: "Pick a user first" }, { status: 400 });
  }
  if (!password || !passwordMatches(role, password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const token = await issueAuthToken(role);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
