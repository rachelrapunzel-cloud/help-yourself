"use server";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sendQueued } from "@/lib/mail";
import { clearOwnerCookie, isOwner, passwordMatches, setOwnerCookie } from "@/lib/owner";
import { addPhoto, removePhoto, storePhoto } from "@/lib/photos";
import { garments, handovers, mails, orders } from "@/lib/schema";

async function guard() {
  if (!(await isOwner())) redirect("/owner/login");
}

export async function login(form: FormData) {
  const pw = String(form.get("password") ?? "");
  if (!passwordMatches(pw)) redirect("/owner/login?wrong=1");
  await setOwnerCookie();
  redirect("/owner");
}

export async function logout() {
  await clearOwnerCookie();
  redirect("/owner/login");
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || randomUUID().slice(0, 8);

export async function saveGarment(form: FormData) {
  await guard();
  const db = await getDb();
  const id = String(form.get("id") || "");
  const data = {
    owner: String(form.get("owner") ?? "a").trim(),
    name: String(form.get("name") ?? "").trim(),
    size: String(form.get("size") ?? "").trim(),
    fit: String(form.get("fit") ?? "").trim(),
    measurements: String(form.get("measurements") ?? "").trim(),
    condition: String(form.get("condition") ?? "").trim(),
    flaws: String(form.get("flaws") ?? "").trim(),
    sort: Number(form.get("sort") ?? 0) || 0,
    updatedAt: new Date(),
  };
  if (!data.name || !data.size) redirect(`/owner/g/${id || "new"}?err=name-and-size`);
  let gid = id;
  if (!id) {
    gid = slug(data.name);
    const clash = await db.select({ id: garments.id }).from(garments).where(eq(garments.id, gid));
    if (clash.length) gid = `${gid}-${randomUUID().slice(0, 4)}`;
    await db.insert(garments).values({ id: gid, ...data, status: "draft" });
  } else {
    await db.update(garments).set(data).where(eq(garments.id, id));
  }
  const file = form.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) redirect(`/owner/g/${gid}?err=photo-too-big`);
    await addPhoto(gid, await storePhoto(file));
  }
  redirect(`/owner/g/${gid}`);
}

export async function setGarmentStatus(form: FormData) {
  await guard();
  const db = await getDb();
  const id = String(form.get("id"));
  const to = String(form.get("to"));
  if (to !== "available" && to !== "withdrawn" && to !== "draft") return;
  await db.transaction(async (tx) => {
    const [g] = await tx.select().from(garments).where(eq(garments.id, id)).for("update");
    if (!g) return;
    // Never republish over a live hold or an allocation; the owner resolves those first.
    if (g.status === "held" || g.status === "allocated") return;
    await tx.update(garments).set({ status: to, statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(garments.id, id));
  });
  redirect(`/owner/g/${id}`);
}

// After a refund, a no-show or a returned garment: the owner confirms it is
// physically back and republishes it. Any open order on it must be settled first.
export async function republish(form: FormData) {
  await guard();
  const db = await getDb();
  const id = String(form.get("id"));
  await db.transaction(async (tx) => {
    const [g] = await tx.select().from(garments).where(eq(garments.id, id)).for("update");
    if (!g || g.status !== "allocated") return;
    const live = await tx.select({ id: orders.id, status: orders.status }).from(orders).where(and(eq(orders.garmentId, id), eq(orders.status, "awaiting_payment")));
    if (live.length) return;
    await tx.update(garments).set({ status: "available", statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(garments.id, id));
  });
  redirect(`/owner/g/${id}`);
}

export async function deletePhoto(form: FormData) {
  await guard();
  await removePhoto(String(form.get("photoId")));
  redirect(`/owner/g/${String(form.get("garmentId"))}`);
}

export async function setHandover(form: FormData) {
  await guard();
  const db = await getDb();
  const orderId = String(form.get("orderId"));
  const to = String(form.get("to"));
  if (!["awaiting_arrangement", "ready", "completed", "cancelled"].includes(to)) return;
  const notes = String(form.get("notes") ?? "");
  await db
    .insert(handovers)
    .values({ orderId, status: to as never, notes, completedAt: to === "completed" ? new Date() : null })
    .onConflictDoUpdate({ target: handovers.orderId, set: { status: to as never, notes, completedAt: to === "completed" ? new Date() : null } });
  redirect("/owner#orders");
}

export async function resendMail(form: FormData) {
  await guard();
  const db = await getDb();
  await sendQueued(db, String(form.get("mailId")));
  redirect("/owner#orders");
}

export async function resolveException(form: FormData) {
  await guard();
  const db = await getDb();
  const orderId = String(form.get("orderId"));
  // The owner has looked at Stripe and decided. Options: release the garment (nothing owed), or leave as is.
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o || o.status !== "exception") return;
    await tx.update(orders).set({ status: "released", updatedAt: new Date() }).where(eq(orders.id, orderId));
    const [g] = await tx.select().from(garments).where(eq(garments.id, o.garmentId)).for("update");
    if (g && g.status === "held") await tx.update(garments).set({ status: "available", statusChangedAt: new Date(), updatedAt: new Date() }).where(eq(garments.id, g.id));
  });
  redirect("/owner#orders");
}

export async function recentOrders() {
  const db = await getDb();
  const rows = await db
    .select({ o: orders, g: garments, h: handovers })
    .from(orders)
    .innerJoin(garments, eq(garments.id, orders.garmentId))
    .leftJoin(handovers, eq(handovers.orderId, orders.id))
    .orderBy(desc(orders.createdAt))
    .limit(100);
  const mailRows = await db.select().from(mails).orderBy(desc(mails.createdAt)).limit(200);
  return { rows, mailRows };
}
