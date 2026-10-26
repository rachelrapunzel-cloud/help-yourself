import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, limited, tooMany } from "@/lib/http";
import { release } from "@/lib/orders";

const Body = z.object({ orderId: z.string().min(1), accessToken: z.string().min(1) });

export async function POST(req: Request) {
  if (limited(req, "release", 20)) return tooMany();
  try {
    const r = await release(...(Object.values(Body.parse(await req.json())) as [string, string]));
    return NextResponse.json({ result: r });
  } catch (e) {
    return fail(e);
  }
}
