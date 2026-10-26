// Holds, checkout, fulfilment, release and expiry for one-garment orders.
// Rules carried from the technical brief:
//  - one garment, one winner: the reservation runs under SELECT ... FOR UPDATE
//  - the buyer's amount is validated here and sent to Stripe unchanged
//  - $0 never touches Stripe; it is recorded as no_payment_required, never paid
//  - allocation happens once, from a verified Stripe record, whoever sees it first
//  - stock is released only when Stripe confirms the session cannot still pay
//  - payment is never handover; handover has its own row and status
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { APP_URL, HOLD_MINUTES, LOCALITY, MAX_CENTS, MIN_CARD_CENTS, SHOP_NAME, privateHandover } from "./config";
import { getDb, type Db } from "./db";
import { queueMail, sendAll } from "./mail";
import { garments, handovers, orders, webhookEvents, type Garment, type Order } from "./schema";
import { stripe } from "./stripe";

export class OrderError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const money = (cents: number) => "$" + (cents / 100).toFixed(2);
const token = () => randomBytes(24).toString("base64url");
const minutesLeft = (d: Date) => Math.max(0, Math.ceil((d.getTime() - Date.now()) / 60000));

/* ------------------------------------------------------------------ amounts */

export function validateAmount(cents: unknown): number {
  if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    throw new OrderError("bad_amount", "Amount must be whole cents between 0 and " + money(MAX_CENTS));
  }
  if (cents > 0 && cents < MIN_CARD_CENTS) {
    // The front end converts these to 0 or 50c; the server never rounds.
    throw new OrderError("under_minimum", `Cards can't take less than ${money(MIN_CARD_CENTS)}. Choose $0 or at least ${money(MIN_CARD_CENTS)}.`);
  }
  return cents;
}

/* --------------------------------------------------------------------- hold */

export async function hold(input: { garmentId: string; amountCents: number; handoverMethod: "pickup" | "courier" }) {
  const amountCents = validateAmount(input.amountCents);
  if (input.handoverMethod !== "pickup" && input.handoverMethod !== "courier") throw new OrderError("bad_handover", "Choose pick up or courier.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(garments).where(eq(garments.id, input.garmentId)).for("update");
    if (!g) throw new OrderError("not_found", "That garment isn't here.", 404);
    if (g.status !== "available") throw new OrderError("taken", "Someone else got it first.", 409);
    const id = randomUUID();
    const accessToken = token();
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60000);
    await tx.insert(orders).values({
      id,
      garmentId: g.id,
      amountCents,
      handoverMethod: input.handoverMethod,
      status: "awaiting_payment",
      holdExpiresAt,
      idempotencyKey: randomUUID(),
      accessToken,
    });
    await tx.update(garments).set({ status: "held", statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(garments.id, g.id));
    return { orderId: id, accessToken, holdExpiresAt };
  });
}

/* ------------------------------------------------------------------ loading */

export async function loadOrder(orderId: string, accessToken: string): Promise<{ order: Order; garment: Garment } | null> {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.accessToken, accessToken)));
  if (!o) return null;
  const [g] = await db.select().from(garments).where(eq(garments.id, o.garmentId));
  return { order: o, garment: g };
}

/* ------------------------------------------------------------- fulfilment */

type Fulfilled = { changed: boolean; mailIds: string[] };

// Allocates the garment to the order once. Safe to call from the webhook, the
// status page and the sweep at the same time.
async function fulfil(db: Db, orderId: string, proof: { kind: "free" } | { kind: "session"; session: Stripe.Checkout.Session }): Promise<Fulfilled> {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw new OrderError("not_found", "Order not found", 404);
    if (o.status === "paid" || o.status === "no_payment_required") return { changed: false, mailIds: [] };
    if (o.status !== "awaiting_payment" && o.status !== "expired" && o.status !== "exception") {
      // released or refunded orders are never fulfilled afterwards
      return { changed: false, mailIds: [] };
    }
    const [g] = await tx.select().from(garments).where(eq(garments.id, o.garmentId)).for("update");

    let status: Order["status"];
    let paymentIntentId: string | null = null;
    if (proof.kind === "free") {
      if (o.amountCents !== 0) throw new OrderError("not_free", "This order needs payment.");
      status = "no_payment_required";
    } else {
      const s = proof.session;
      const ok =
        s.id === o.stripeSessionId &&
        s.metadata?.order_id === o.id &&
        s.payment_status === "paid" &&
        s.currency === "nzd" &&
        s.amount_total === o.amountCents;
      if (!ok) {
        // Money may have moved but it does not match this order. Commit the
        // exception for the owner to look at; never allocate, never retry blindly.
        await tx.update(orders).set({ status: "exception", exceptionNote: `session mismatch ${s.id}: paid=${s.payment_status} amount=${s.amount_total} ${s.currency}`, updatedAt: new Date() }).where(eq(orders.id, o.id));
        return { changed: true, mailIds: [] };
      }
      status = "paid";
      paymentIntentId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
    }

    // If the garment was re-released to someone else in the meantime (paid at
    // the expiry boundary after a release), do not take it from them: record an exception.
    if (g.status === "allocated" || (g.status === "held" && (await otherLiveOrder(tx, g.id, o.id)))) {
      await tx.update(orders).set({ status: "exception", exceptionNote: "garment no longer free at fulfilment", updatedAt: new Date() }).where(eq(orders.id, o.id));
      return { changed: true, mailIds: [] };
    }

    await tx.update(orders).set({ status, stripePaymentIntentId: paymentIntentId, updatedAt: new Date() }).where(eq(orders.id, o.id));
    await tx.update(garments).set({ status: "allocated", statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(garments.id, g.id));
    await tx.insert(handovers).values({ orderId: o.id }).onConflictDoNothing();
    const mailIds: string[] = [];
    if (o.email) mailIds.push(await queueMail(tx, { orderId: o.id, kind: "allocated", to: o.email, ...allocatedMail({ ...o, status }, g) }));
    return { changed: true, mailIds };
  });
}

async function otherLiveOrder(tx: Db, garmentId: string, exceptId: string) {
  const rows = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.garmentId, garmentId), inArray(orders.status, ["awaiting_payment", "paid", "no_payment_required"])));
  return rows.some((r) => r.id !== exceptId);
}

/* ----------------------------------------------------------------- checkout */

// Called from the hold page. Records the email, then either completes a free
// claim or returns the Stripe Checkout URL for the exact amount.
export async function checkout(input: { orderId: string; accessToken: string; email: string }) {
  const db = await getDb();
  const found = await loadOrder(input.orderId, input.accessToken);
  if (!found) throw new OrderError("not_found", "Order not found", 404);
  let { order } = found;
  const { garment } = found;
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OrderError("bad_email", "We need an email for the pickup details.");

  if (order.status !== "awaiting_payment") {
    if (order.status === "paid" || order.status === "no_payment_required") return { kind: "done" as const, url: statusUrl(order) };
    throw new OrderError("not_open", "This hold is no longer open.", 409);
  }
  if (order.holdExpiresAt.getTime() < Date.now()) {
    await expireIfUnpaid(db, order.id, "expired");
    throw new OrderError("hold_expired", "The hold ran out.", 409);
  }

  await db.update(orders).set({ email, updatedAt: new Date() }).where(eq(orders.id, order.id));
  order = { ...order, email };

  if (order.amountCents === 0) {
    const r = await fulfil(db, order.id, { kind: "free" });
    await sendAll(db, r.mailIds);
    return { kind: "free" as const, url: statusUrl(order) };
  }

  // Reuse an open session rather than creating a second one for the same order.
  if (order.stripeSessionId) {
    const s = await stripe().checkout.sessions.retrieve(order.stripeSessionId);
    if (s.status === "open" && s.url) return { kind: "pay" as const, url: s.url };
    if (s.status === "complete" && s.payment_status === "paid") {
      const r = await fulfil(db, order.id, { kind: "session", session: s });
      await sendAll(db, r.mailIds);
      return { kind: "done" as const, url: statusUrl(order) };
    }
    // expired: fall through and create a fresh one on the same order
  }

  const attempt = order.sessionAttempt + 1;
  // Stripe requires at least 30 minutes until expiry, so starting payment
  // renews the hold to match the session. Shown honestly on the page.
  const expiresAt = new Date(Date.now() + Math.max(HOLD_MINUTES, 31) * 60000);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: order.id,
        customer_email: email,
        metadata: { order_id: order.id, garment_id: garment.id },
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "nzd", unit_amount: order.amountCents, product_data: { name: garment.name, description: `Size ${garment.size}. Your chosen amount.` } },
          },
        ],
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${APP_URL}/o/${order.id}?t=${order.accessToken}&back=success`,
        cancel_url: `${APP_URL}/o/${order.id}?t=${order.accessToken}&back=cancel`,
        submit_type: "pay",
      },
      { idempotencyKey: `${order.idempotencyKey}:${attempt}` },
    );
  } catch (e) {
    // Uncertain outcome: keep the hold and flag for reconciliation rather than retrying blindly.
    await db.update(orders).set({ status: "exception", exceptionNote: `session create failed: ${String(e).slice(0, 300)}`, updatedAt: new Date() }).where(eq(orders.id, order.id));
    throw new OrderError("stripe_unavailable", "We couldn't reach the card provider. Your hold is kept and we'll sort it out.", 503);
  }
  await db
    .update(orders)
    .set({ stripeSessionId: session.id, sessionAttempt: attempt, holdExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  if (!session.url) throw new OrderError("no_url", "Checkout did not return a page.", 502);
  return { kind: "pay" as const, url: session.url };
}

export const statusUrl = (o: Pick<Order, "id" | "accessToken">) => `/o/${o.id}?t=${o.accessToken}`;

// "Change the amount" on an open hold. Expires any open Stripe session first so
// the old amount can never be paid; the hold itself stays.
export async function changeAmount(input: { orderId: string; accessToken: string; amountCents: number }) {
  const db = await getDb();
  const found = await loadOrder(input.orderId, input.accessToken);
  if (!found) throw new OrderError("not_found", "Order not found", 404);
  const { order } = found;
  if (order.status !== "awaiting_payment") throw new OrderError("not_open", "This hold is no longer open.", 409);
  if (order.holdExpiresAt.getTime() < Date.now()) {
    await expireIfUnpaid(db, order.id, "expired");
    throw new OrderError("hold_expired", "The hold ran out.", 409);
  }
  const cents = validateAmount(input.amountCents);
  if (cents === order.amountCents) return { url: statusUrl(order) };
  if (order.stripeSessionId) {
    const s = await stripe().checkout.sessions.retrieve(order.stripeSessionId);
    if (s.status === "complete" && s.payment_status === "paid") {
      const r = await fulfil(db, order.id, { kind: "session", session: s });
      await sendAll(db, r.mailIds);
      throw new OrderError("already_paid", "That payment already went through, so the amount can't change.", 409);
    }
    if (s.status === "open") await stripe().checkout.sessions.expire(s.id);
  }
  await db.update(orders).set({ amountCents: cents, stripeSessionId: null, updatedAt: new Date() }).where(eq(orders.id, order.id));
  return { url: statusUrl(order) };
}

/* --------------------------------------------------------- release / expiry */

// Sets an awaiting order to expired/released and frees the garment, but only
// when no live payment can still land on it.
async function expireIfUnpaid(db: Db, orderId: string, to: "expired" | "released"): Promise<"freed" | "fulfilled" | "kept"> {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || o.status !== "awaiting_payment") return "kept";
  if (o.stripeSessionId) {
    let s: Stripe.Checkout.Session;
    try {
      s = await stripe().checkout.sessions.retrieve(o.stripeSessionId);
    } catch {
      return "kept"; // API uncertainty: keep the hold, the sweep will try again
    }
    if (s.status === "complete" && s.payment_status === "paid") {
      const r = await fulfil(db, o.id, { kind: "session", session: s });
      await sendAll(db, r.mailIds);
      return "fulfilled";
    }
    if (s.status === "open") {
      try {
        await stripe().checkout.sessions.expire(s.id);
      } catch {
        return "kept";
      }
    }
  }
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!cur || cur.status !== "awaiting_payment") return;
    await tx.update(orders).set({ status: to, updatedAt: new Date() }).where(eq(orders.id, orderId));
    const [g] = await tx.select().from(garments).where(eq(garments.id, cur.garmentId)).for("update");
    if (g && g.status === "held") await tx.update(garments).set({ status: "available", statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(garments.id, g.id));
  });
  return "freed";
}

export async function release(orderId: string, accessToken: string) {
  const db = await getDb();
  const found = await loadOrder(orderId, accessToken);
  if (!found) throw new OrderError("not_found", "Order not found", 404);
  return expireIfUnpaid(db, orderId, "released");
}

export async function sweepExpiredHolds() {
  const db = await getDb();
  const due = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "awaiting_payment"), lt(orders.holdExpiresAt, new Date())));
  const results: Record<string, string> = {};
  for (const { id } of due) results[id] = await expireIfUnpaid(db, id, "expired");
  return results;
}

/* --------------------------------------------------------------- reconcile */

// Used by the status page: if a session exists, ask Stripe what it has and
// settle the order accordingly. Returns the refreshed order.
export async function reconcile(orderId: string, accessToken: string) {
  const db = await getDb();
  const found = await loadOrder(orderId, accessToken);
  if (!found) return null;
  const { order } = found;
  if (order.status === "awaiting_payment") {
    if (order.holdExpiresAt.getTime() < Date.now()) await expireIfUnpaid(db, order.id, "expired");
    else if (order.stripeSessionId) {
      try {
        const s = await stripe().checkout.sessions.retrieve(order.stripeSessionId);
        if (s.status === "complete" && s.payment_status === "paid") {
          const r = await fulfil(db, order.id, { kind: "session", session: s });
          await sendAll(db, r.mailIds);
        } else if (s.status === "expired") {
          await expireIfUnpaid(db, order.id, "expired");
        }
      } catch {
        /* leave as is; page shows "checking" */
      }
    }
  }
  return loadOrder(orderId, accessToken);
}

/* ----------------------------------------------------------------- webhook */

export async function handleStripeEvent(event: Stripe.Event): Promise<"processed" | "duplicate" | "ignored"> {
  const db = await getDb();
  const inserted = await db.insert(webhookEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: webhookEvents.id });
  if (inserted.length === 0) return "duplicate";

  try {
    return await processEvent(db, event);
  } catch (e) {
    // Drop the record so Stripe's retry is processed, not treated as a duplicate.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, event.id));
    throw e;
  }
}

async function processEvent(db: Db, event: Stripe.Event): Promise<"processed" | "ignored"> {
  let outcome: "processed" | "ignored" = "ignored";
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    const orderId = s.metadata?.order_id;
    if (orderId && s.payment_status === "paid") {
      const r = await fulfil(db, orderId, { kind: "session", session: s });
      await sendAll(db, r.mailIds);
      outcome = "processed";
    }
  } else if (event.type === "checkout.session.expired") {
    const s = event.data.object as Stripe.Checkout.Session;
    const orderId = s.metadata?.order_id;
    if (orderId) {
      await expireIfUnpaid(db, orderId, "expired");
      outcome = "processed";
    }
  } else if (event.type === "charge.refunded") {
    const c = event.data.object as Stripe.Charge;
    const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
    if (pi) {
      // A refund never republishes the garment; the owner decides that by hand.
      await db.update(orders).set({ status: "refunded", updatedAt: new Date() }).where(and(eq(orders.stripePaymentIntentId, pi), eq(orders.status, "paid")));
      outcome = "processed";
    }
  }
  await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
  return outcome;
}

/* ------------------------------------------------------------------ listing */

export type ListedGarment = Garment & { minutesLeft?: number };

export async function listGarments(showSpecimens: boolean): Promise<ListedGarment[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(garments)
    .where(showSpecimens ? inArray(garments.status, ["available", "held", "allocated"]) : and(inArray(garments.status, ["available", "held", "allocated"]), eq(garments.specimen, false)))
    .orderBy(garments.sort, garments.createdAt);
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const visible = rows.filter((g) => g.status !== "allocated" || g.statusChangedAt.getTime() > cutoff);
  const heldIds = visible.filter((g) => g.status === "held").map((g) => g.id);
  const left = new Map<string, number>();
  if (heldIds.length) {
    const live = await db
      .select({ id: orders.id, garmentId: orders.garmentId, holdExpiresAt: orders.holdExpiresAt })
      .from(orders)
      .where(and(inArray(orders.garmentId, heldIds), eq(orders.status, "awaiting_payment")));
    for (const o of live) {
      if (o.holdExpiresAt.getTime() < Date.now()) {
        // Past its hold: settle it now (checks Stripe first) so the list never
        // depends on the scheduled sweep. Free hosting plans run crons rarely.
        const r = await expireIfUnpaid(db, o.id, "expired");
        const g = visible.find((x) => x.id === o.garmentId);
        if (g && r === "freed") g.status = "available";
        if (g && r === "fulfilled") g.status = "allocated";
        continue;
      }
      left.set(o.garmentId, minutesLeft(o.holdExpiresAt));
    }
    // Held garments with no live order are stale; free them.
    for (const g of visible) if (g.status === "held" && !left.has(g.id) && !live.some((o) => o.garmentId === g.id)) await freeStale(db, g.id);
  }
  return visible.map((g) => ({ ...g, minutesLeft: left.get(g.id) }));
}

export async function getGarment(id: string): Promise<ListedGarment | null> {
  const db = await getDb();
  let [g] = await db.select().from(garments).where(eq(garments.id, id));
  if (!g || g.status === "draft" || g.status === "withdrawn") return null;
  let ml: number | undefined;
  if (g.status === "held") {
    const [o] = await db
      .select({ id: orders.id, holdExpiresAt: orders.holdExpiresAt })
      .from(orders)
      .where(and(eq(orders.garmentId, id), eq(orders.status, "awaiting_payment")));
    if (!o) await freeStale(db, g.id);
    else if (o.holdExpiresAt.getTime() < Date.now()) await expireIfUnpaid(db, o.id, "expired");
    else ml = minutesLeft(o.holdExpiresAt);
    if (ml === undefined) [g] = await db.select().from(garments).where(eq(garments.id, id));
  }
  return { ...g, minutesLeft: ml };
}

async function freeStale(db: Db, garmentId: string) {
  await db.transaction(async (tx) => {
    const [g] = await tx.select().from(garments).where(eq(garments.id, garmentId)).for("update");
    if (!g || g.status !== "held") return;
    const live = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.garmentId, garmentId), eq(orders.status, "awaiting_payment")));
    if (live.length === 0) await tx.update(garments).set({ status: "available", statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(garments.id, garmentId));
  });
}

/* -------------------------------------------------------------------- mail */

function allocatedMail(o: Order, g: Garment) {
  const h = privateHandover();
  const amount = o.amountCents === 0 ? "Nothing to pay." : `${money(o.amountCents)}, paid.`;
  const how =
    o.handoverMethod === "pickup"
      ? `Picking it up\nIt's at:\n${h.address}\n\n${h.pickupNote}\nNo hard deadline. If anything changes, reply to this email.`
      : `Booking your courier\nBook any courier to collect from:\n${h.address}\n\nParcel ${h.parcel}. We pack it. If your courier needs a printed label, reply to this email with it attached, plus the booking reference and the pickup window.\nCourier cost isn't part of what you gave, and we don't add anything on top.`;
  return {
    subject: `${SHOP_NAME}: the ${g.name.toLowerCase()} is yours`,
    body: `The ${g.name.toLowerCase()} (size ${g.size}) is allocated to you. ${amount}\n\nThis means it's yours. It is not yet in your hands; that part is arranged as below.\n\n${how}\n\nStatus page: ${APP_URL}${statusUrl(o)}\n\n${SHOP_NAME}, ${LOCALITY}`,
  };
}

export const sqlNow = sql`now()`;
