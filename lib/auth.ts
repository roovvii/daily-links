export const AUTH_COOKIE = "dl_auth";

export type Role = "ravi" | "sreeya";
export const ROLES: Role[] = ["ravi", "sreeya"];
export const ROLE_LABEL: Record<Role, string> = {
  ravi: "Ravi",
  sreeya: "Sreeya",
};

export const ROLE_TZ: Record<Role, string> = {
  ravi: "America/Chicago",
  sreeya: "Asia/Kolkata",
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function getRolePassword(role: Role): string | null {
  const envKey = role === "ravi" ? "APP_PASSWORD" : "SREEYA_PASSWORD";
  const value = process.env[envKey];
  return value && value.length > 0 ? value : null;
}

function tokenPayload(role: Role): string {
  return `role:${role}`;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function issueAuthToken(role: Role): Promise<string> {
  const payload = tokenPayload(role);
  const sig = await hmacHex(getSecret(), payload);
  return `${payload}.${sig}`;
}

export async function verifyAuthToken(token: string | undefined | null): Promise<Role | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const m = payload.match(/^role:(ravi|sreeya)$/);
  if (!m) return null;
  const role = m[1] as Role;
  const expected = await hmacHex(getSecret(), payload);
  return constantTimeEqual(sig, expected) ? role : null;
}

export function passwordMatches(role: Role, input: string): boolean {
  const expected = getRolePassword(role);
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function getRoleFromRequest(req: Request): Promise<Role | null> {
  const header = req.headers.get("cookie") ?? "";
  const cookies = parseCookieHeader(header);
  return verifyAuthToken(cookies[AUTH_COOKIE]);
}
