import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { handleStripeEvent } from "@/lib/orders";
import { stripe } from "@/lib/stripe";

// Stripe signs the raw body. Read it as text, never as parsed JSON.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook secret not set" }, { status: 500 });
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `invalid signature: ${String(e).slice(0, 80)}` }, { status: 400 });
  }
  try {
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    console.error("webhook handling failed", event.id, e);
    // The event record was dropped, so a 500 makes Stripe retry it properly.
    return NextResponse.json({ received: false, outcome: "error" }, { status: 500 });
  }
}
