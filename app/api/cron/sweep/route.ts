import { NextResponse } from "next/server";
import { sweepExpiredHolds } from "@/lib/orders";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const r = await sweepExpiredHolds();
  return NextResponse.json({ swept: r });
}
