import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCALITY, NAME_IS_YOURS_FOR } from "@/lib/config";
import { getGarment } from "@/lib/orders";
import TakeClient from "./TakeClient";

export const dynamic = "force-dynamic";

export default async function TakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGarment(id);
  if (!g) notFound();
  if (g.status !== "available") {
    return (
      <>
        <div className="top"><Link href={`/g/${g.id}`} className="back">Back</Link></div>
        <div className="res">
          <h1>{g.status === "held" ? "Someone is deciding." : "Someone else got it first."}</h1>
          <p>{g.status === "held" ? `If they don't finish, it's back in about ${g.minutesLeft ?? "a few"} minutes.` : "Nothing was charged to you."}</p>
        </div>
        <div className="actions"><Link href="/" className="btn">Back to the list</Link></div>
      </>
    );
  }
  return (
    <>
      <div className="top">
        <Link href={`/g/${g.id}`} className="back">Back</Link>
        <span className="tiny">{g.name}</span>
      </div>
      <TakeClient garmentId={g.id} yoursFor={NAME_IS_YOURS_FOR} locality={LOCALITY} />
    </>
  );
}
