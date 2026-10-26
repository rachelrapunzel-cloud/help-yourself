import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, limited, tooMany } from "@/lib/http";
import { checkout } from "@/lib/orders";

const Body = z.object({ orderId: z.string().min(1), accessToken: z.string().min(1), email: z.string().min(3) });

export async function POST(req: Request) {
  if (limited(req, "checkout", 20)) return tooMany();
  try {
    const r = await checkout(Body.parse(await req.json()));
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Check your email address.", code: "bad_input" }, { status: 400 });
    return fail(e);
  }
}
