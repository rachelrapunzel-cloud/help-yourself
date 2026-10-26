import { NextResponse } from "next/server";
import { OrderError } from "./orders";

export function fail(e: unknown) {
  if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong on our side.", code: "server" }, { status: 500 });
}

// Small in-memory limiter: enough for a household shop on one instance.
// Swap for a shared store if the pilot ever runs on more than one.
const buckets = new Map<string, { n: number; reset: number }>();
export function limited(req: Request, key: string, max = 30, windowMs = 60000) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < now) {
    buckets.set(k, { n: 1, reset: now + windowMs });
    return false;
  }
  b.n += 1;
  return b.n > max;
}
export const tooMany = () => NextResponse.json({ error: "Too many requests. Try again in a minute.", code: "rate" }, { status: 429 });
