// Transactional mail. Rows are queued inside the order transaction so a crash
// never loses one; sending is best effort and retried by the owner or sweep.
// Without RESEND_API_KEY the mail is written to the server log and marked
// "logged" so the sandbox can be checked without an email provider.
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import { mails } from "./schema";

const FROM = process.env.MAIL_FROM ?? "Help Yourself <onboarding@resend.dev>";
const REPLY_TO = process.env.MAIL_REPLY_TO; // the owner's own address, so "reply to this email" reaches a person

export async function queueMail(
  tx: Db,
  m: { orderId: string | null; kind: string; to: string; subject: string; body: string },
) {
  const id = randomUUID();
  await tx.insert(mails).values({ id, orderId: m.orderId, kind: m.kind, toEmail: m.to, subject: m.subject, body: m.body });
  return id;
}

export async function sendQueued(db: Db, id: string) {
  const [m] = await db.select().from(mails).where(eq(mails.id, id));
  if (!m || m.status === "sent") return;
  const key = process.env.RESEND_API_KEY;
  try {
    if (!key) {
      console.log(`[mail logged, no provider] to=${m.toEmail} subject=${m.subject}\n${m.body}`);
      await db.update(mails).set({ status: "logged", attempts: m.attempts + 1, sentAt: new Date() }).where(eq(mails.id, id));
      return;
    }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [m.toEmail], subject: m.subject, text: m.body, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    await db.update(mails).set({ status: "sent", attempts: m.attempts + 1, sentAt: new Date(), lastError: null }).where(eq(mails.id, id));
  } catch (e) {
    await db
      .update(mails)
      .set({ status: "failed", attempts: m.attempts + 1, lastError: String(e).slice(0, 500) })
      .where(eq(mails.id, id));
  }
}

export async function sendAll(db: Db, ids: string[]) {
  for (const id of ids) await sendQueued(db, id);
}
