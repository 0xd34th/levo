import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

const COOKIE = "aisui_fp";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function getOrCreateFingerprint(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{16,}$/.test(existing)) return existing;
  const fresh = randomBytes(18).toString("base64url");
  jar.set(COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR,
    path: "/",
  });
  return fresh;
}

export async function readFingerprint(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}
