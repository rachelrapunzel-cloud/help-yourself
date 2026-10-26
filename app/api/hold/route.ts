import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, limited, tooMany } from "@/lib/http";
import { hold, statusUrl } from "@/lib/orders";

const Body = z.object({ garmentId: z.string().min(1), amountCents: z.number().int(), handoverMethod: z.enum(["pickup", "courier"]) });

export async function POST(req: Request) {
  if (limited(req, "hold", 20)) return tooMany();
  try {
    const body = Body.parse(await req.json());
    const r = await hold(body);
    return NextResponse.json({ ...r, url: statusUrl({ id: r.orderId, accessToken: r.accessToken }) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Check the amount and how it's getting home.", code: "bad_input" }, { status: 400 });
    return fail(e);
  }
}
