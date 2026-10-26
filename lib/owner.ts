// Owner access: one shared password from env, held as an HttpOnly cookie
// carrying an HMAC so the password itself is never stored in the browser.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "hy_owner";
const secret = () => process.env.OWNER_PASSWORD ?? "";
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

export function ownerConfigured() {
  return secret().length >= 8;
}

export function passwordMatches(input: string) {
  const a = Buffer.from(sign(input));
  const b = Buffer.from(sign(secret()));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setOwnerCookie() {
  const c = await cookies();
  c.set(COOKIE, sign("owner-session"), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearOwnerCookie() {
  (await cookies()).delete(COOKIE);
}

export async function isOwner() {
  if (!ownerConfigured()) return false;
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  const expected = sign("owner-session");
  return v.length === expected.length && timingSafeEqual(Buffer.from(v), Buffer.from(expected));
}
