import Link from "next/link";
import { notFound } from "next/navigation";
import { CITY, LOCALITY, OWNER_LABELS } from "@/lib/config";
import { getGarment } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function GarmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGarment(id);
  if (!g) notFound();
  return (
    <>
      <div className="top">
        <Link href="/" className="back">
          Back
        </Link>
        {g.specimen && <span className="tiny">specimen</span>}
      </div>
      <div className="photo">photo to come</div>
      <div className="thumbs">
        <i /><i /><i /><i />
      </div>
      <div className="ttl">{g.name}</div>
      {g.status === "allocated" && <div className="note">Gone. Someone has taken this. It stays up for a day so the photo you saw yesterday isn&rsquo;t confusing.</div>}
      {g.status === "held" && <div className="note">On hold. Someone is deciding. If they don&rsquo;t finish, it&rsquo;s back in about {g.minutesLeft ?? "a few"} minutes.</div>}
      <div className="facts">
        <div className="r"><b>From</b><span>{OWNER_LABELS[g.owner] ?? g.owner}</span></div>
        <div className="r"><b>Size</b><span>{g.size}. {g.fit}</span></div>
        <div className="r"><b>Measurements</b><span>{g.measurements}</span></div>
        <div className="r"><b>Condition</b><span>{g.condition}</span></div>
        <div className="r"><b>Flaws</b><span>{g.flaws}</span></div>
      </div>
      <div className="para">
        <p><b>Pick up:</b> {LOCALITY}, {CITY}. Left on the doorstep for you. Exact address after it&rsquo;s yours.</p>
        <p><b>Courier:</b> you book and pay for it. We pack it. About a shoebox, under 1 kg.</p>
        <p><b>What you give:</b> any amount you choose on the next page, including nothing.</p>
      </div>
      <div className="cta">
        {g.status === "available" ? (
          <Link href={`/g/${g.id}/take`} className="btn">Take this</Link>
        ) : (
          <Link href="/" className="btn line">Back to the list</Link>
        )}
      </div>
    </>
  );
}
