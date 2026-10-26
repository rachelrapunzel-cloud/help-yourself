import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isOwner } from "@/lib/owner";
import { money } from "@/lib/orders";
import { garments } from "@/lib/schema";
import { OWNER_LABELS, SHOP_NAME } from "@/lib/config";
import { logout, recentOrders, resendMail, resolveException, setHandover } from "./actions";

export const dynamic = "force-dynamic";

export default async function Owner() {
  if (!(await isOwner())) redirect("/owner/login");
  const db = await getDb();
  const all = await db.select().from(garments).orderBy(asc(garments.sort), asc(garments.createdAt));
  const { rows, mailRows } = await recentOrders();
  const fmt = (d: Date) => d.toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="top">
        <span style={{ fontWeight: 600 }}>{SHOP_NAME} · owner</span>
        <form action={logout}><button className="tiny" style={{ textDecoration: "underline" }}>Log out</button></form>
      </div>
      <div className="sect"><span>Garments</span><Link href="/owner/g/new" style={{ textDecoration: "underline" }}>Add a garment</Link></div>
      <div className="facts" style={{ marginTop: 0 }}>
        {all.map((g) => (
          <Link key={g.id} href={`/owner/g/${g.id}`} className="r" style={{ display: "flex" }}>
            <b style={{ width: 90 }}>{g.status}</b>
            <span>{g.name} · {g.size} · {OWNER_LABELS[g.owner] ?? g.owner}{g.specimen ? " · specimen" : ""}</span>
          </Link>
        ))}
        {all.length === 0 && <div className="r"><span>No garments yet.</span></div>}
      </div>

      <div className="sect" id="orders"><span>Orders, newest first</span><span>{rows.length}</span></div>
      {rows.map(({ o, g, h }) => {
        const yours = o.status === "paid" || o.status === "no_payment_required";
        const mail = mailRows.filter((m) => m.orderId === o.id);
        return (
          <div key={o.id} className="private" style={{ marginTop: 10 }}>
            <div className="lab">{fmt(o.createdAt)} · {o.status}{o.exceptionNote ? ` · ${o.exceptionNote}` : ""}</div>
            <h3>{g.name} · {o.amountCents === 0 ? "$0" : money(o.amountCents)} · {o.handoverMethod}</h3>
            <p>{o.email ?? "no email yet"}</p>
            {yours && (
              <form action={setHandover} style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="orderId" value={o.id} />
                <div className="tiny">Handover: {h?.status ?? "awaiting_arrangement"}{h?.completedAt ? ` · ${fmt(h.completedAt)}` : ""}</div>
                <input name="notes" placeholder="Notes (courier ref, agreed time)" defaultValue={h?.notes ?? ""} style={{ border: "1px solid #bbb", padding: 8, font: "inherit" }} />
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {(["awaiting_arrangement", "ready", "completed", "cancelled"] as const).map((s) => (
                    <button key={s} name="to" value={s} className="tiny" style={{ textDecoration: "underline", color: h?.status === s ? "#111" : undefined }}>{s.replace("_", " ")}</button>
                  ))}
                </div>
              </form>
            )}
            {o.status === "exception" && (
              <form action={resolveException}>
                <input type="hidden" name="orderId" value={o.id} />
                <p className="tiny">Check this order in the Stripe dashboard first. If nothing is owed to the buyer, release the garment.</p>
                <button className="btn line" style={{ padding: 8 }}>Release the garment</button>
              </form>
            )}
            {mail.map((m) => (
              <form key={m.id} action={resendMail} className="tiny" style={{ marginTop: 6 }}>
                <input type="hidden" name="mailId" value={m.id} />
                mail {m.kind}: {m.status}{m.lastError ? ` (${m.lastError.slice(0, 60)})` : ""} <button style={{ textDecoration: "underline" }}>resend</button>
              </form>
            ))}
          </div>
        );
      })}
      <div className="foot">Refunds start in the Stripe dashboard. A refund never republishes a garment; open it above and republish it yourself once it&rsquo;s back.</div>
    </>
  );
}
