import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCALITY, NAME_IS_YOURS_FOR, privateHandover } from "@/lib/config";
import { money, reconcile } from "@/lib/orders";
import { HoldForm, Countdown, Checking, ReleaseButton } from "./OrderClient";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; back?: string }> }) {
  const { id } = await params;
  const { t = "", back } = await searchParams;
  const found = await reconcile(id, t);
  if (!found) notFound();
  const { order: o, garment: g } = found;
  const lower = g.name.toLowerCase();
  const yours = o.status === "paid" || o.status === "no_payment_required";
  const how = o.handoverMethod === "pickup" ? `Pick up, ${LOCALITY}` : "Your courier";
  const statusUrl = `/o/${o.id}?t=${o.accessToken}`;

  const StatusList = () => (
    <div className="status">
      <div className="r done"><span>Held for you</span><span>Yes</span></div>
      <div className={"r" + (yours ? " done" : "")}><span>Allocated to you</span><span>{yours ? "Yes" : "Not yet"}</span></div>
      <div className="r"><span>Payment</span><span>
        {o.status === "no_payment_required" ? "Nothing to pay" : o.status === "paid" ? `${money(o.amountCents)}, paid` : o.status === "refunded" ? `${money(o.amountCents)}, refunded` : `${money(o.amountCents)}, not paid`}
      </span></div>
      <div className="r"><span>Handed over</span><span>Not yet</span></div>
    </div>
  );

  /* ---------------- yours ---------------- */
  if (yours) {
    const h = privateHandover();
    const head = NAME_IS_YOURS_FOR ? (o.amountCents === 0 ? "Yours for nothing." : `Yours for ${money(o.amountCents)}.`) : "It's yours.";
    return (
      <>
        <div className="top"><Link href="/" className="back">Back to the list</Link></div>
        <div className="res">
          <h1>{head}</h1>
          <p>{o.status === "no_payment_required" ? "Nothing to pay." : `${money(o.amountCents)} went through.`} The {lower} is allocated to you. The only thing left is getting it to you.</p>
        </div>
        <StatusList />
        <div className="private">
          <div className="lab">Only you can see this</div>
          {o.handoverMethod === "pickup" ? (
            <>
              <h3>Picking it up</h3>
              <p>It&rsquo;s at:</p>
              <div className="addr">{h.address}</div>
              <p>{h.pickupNote}</p>
              <p>No hard deadline. If anything changes, reply to the email we&rsquo;ve sent you.</p>
            </>
          ) : (
            <>
              <h3>Booking your courier</h3>
              <p>Book any courier to collect from:</p>
              <div className="addr">{h.address}</div>
              <p>Parcel {h.parcel}. We pack it. If your courier needs a printed label, reply to the email we&rsquo;ve sent you with it attached, plus the booking reference and the pickup window.</p>
              <p>Courier cost isn&rsquo;t part of what you gave, and we don&rsquo;t add anything on top.</p>
            </>
          )}
        </div>
        <div className="para" style={{ color: "#666", fontSize: 13 }}>We&rsquo;ve emailed this to {o.email}. Keep this page&rsquo;s link; it&rsquo;s private to you. The list just shows the garment as gone.</div>
        <div className="actions"><Link href="/" className="btn line">Back to the list</Link></div>
      </>
    );
  }

  /* ---------------- awaiting payment ---------------- */
  if (o.status === "awaiting_payment") {
    const expires = o.holdExpiresAt.toISOString();
    // Back from Stripe without a webhook yet: ask again for a short while.
    if (back === "success" && o.stripeSessionId) {
      return (
        <>
          <div className="top"><span className="tiny">{g.name}</span></div>
          <div className="res"><h1>Checking your payment.</h1><p>We&rsquo;re confirming with the card provider rather than guessing.</p></div>
          <Checking statusUrl={statusUrl} orderId={o.id} token={o.accessToken} expires={expires} />
          <StatusList />
        </>
      );
    }
    const cancelled = back === "cancel";
    return (
      <>
        <div className="top">
          <Link href={`/g/${g.id}`} className="back">Back</Link>
          <span className="tiny">{g.name}</span>
        </div>
        <div className="hold">
          <h2>{cancelled ? "Nothing was charged." : "Held for you"}</h2>
          <div className="t"><Countdown expires={expires} statusUrl={statusUrl} /></div>
          <p>{cancelled ? `Nothing changed. The ${lower} is still held for you.` : "It's off the list while you finish. If the time runs out it goes back for anyone."}</p>
        </div>
        <div className="summary">
          <div className="r"><b>Garment</b><span>{g.name}</span></div>
          <div className="r"><b>You give</b><span>{o.amountCents === 0 ? "$0, nothing to pay" : money(o.amountCents)}</span></div>
          <div className="r"><b>Getting it home</b><span>{how}</span></div>
        </div>
        <HoldForm orderId={o.id} token={o.accessToken} email={o.email ?? ""} amountCents={o.amountCents} retry={cancelled} />
        <div className="actions" style={{ paddingTop: 0 }}>
          <Link href={`/o/${o.id}/amount?t=${o.accessToken}`} className="btn text">Change the amount</Link>
          <ReleaseButton orderId={o.id} token={o.accessToken} />
        </div>
      </>
    );
  }

  /* ---------------- expired / released / raced / other ---------------- */
  const title =
    o.status === "expired" ? "The hold ran out." : o.status === "released" ? "Back on the list." : o.status === "refunded" ? "Refunded." : "Held for review.";
  const body =
    o.status === "expired"
      ? `Thirty minutes passed, so the ${lower} is back on the list for anyone. Nothing was charged.`
      : o.status === "released"
        ? `You let the ${lower} go. Nothing was charged.`
        : o.status === "refunded"
          ? `Your ${money(o.amountCents)} was refunded. The ${lower} is no longer allocated to you.`
          : `Something about this order needs a person to look at it. Nothing more will be charged. We'll be in touch at ${o.email ?? "your email"}.`;
  return (
    <>
      <div className="top"><Link href="/" className="back">Back to the list</Link></div>
      <div className="res"><h1>{title}</h1><p>{body}</p></div>
      <StatusList />
      <div className="actions">
        {(o.status === "expired" || o.status === "released") && g.status === "available" && (
          <Link href={`/g/${g.id}/take`} className="btn">Still there? Try again</Link>
        )}
        <Link href="/" className="btn line">Back to the list</Link>
      </div>
    </>
  );
}
