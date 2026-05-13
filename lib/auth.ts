export const AUTH_COOKIE = "dl_auth";
const TOKEN_PAYLOAD = "authenticated";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function getAppPassword(): string {
  const pw = process.env.APP_PASSWORD;
  if (!pw) throw new Error("APP_PASSWORD is not set");
  return pw;
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

export async function issueAuthToken(): Promise<string> {
  const sig = await hmacHex(getSecret(), TOKEN_PAYLOAD);
  return `${TOKEN_PAYLOAD}.${sig}`;
}

export async function verifyAuthToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (payload !== TOKEN_PAYLOAD || !sig) return false;
  const expected = await hmacHex(getSecret(), TOKEN_PAYLOAD);
  return constantTimeEqual(sig, expected);
}

export function passwordMatches(input: string): boolean {
  return constantTimeEqual(input, getAppPassword());
}
