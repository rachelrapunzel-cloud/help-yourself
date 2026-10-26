import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, limited, tooMany } from "@/lib/http";
import { changeAmount } from "@/lib/orders";

const Body = z.object({ orderId: z.string().min(1), accessToken: z.string().min(1), amountCents: z.number().int() });

export async function POST(req: Request) {
  if (limited(req, "amount", 20)) return tooMany();
  try {
    return NextResponse.json(await changeAmount(Body.parse(await req.json())));
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Check the amount.", code: "bad_input" }, { status: 400 });
    return fail(e);
  }
}
