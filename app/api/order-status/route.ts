import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { reconcile } from "@/lib/orders";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const t = u.searchParams.get("t") ?? "";
  try {
    const r = await reconcile(id, t);
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ status: r.order.status, holdExpiresAt: r.order.holdExpiresAt, hasSession: Boolean(r.order.stripeSessionId) });
  } catch (e) {
    return fail(e);
  }
}
