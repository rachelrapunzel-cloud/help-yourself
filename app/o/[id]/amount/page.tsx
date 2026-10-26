import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCALITY, NAME_IS_YOURS_FOR } from "@/lib/config";
import { loadOrder } from "@/lib/orders";
import ChangeClient from "./ChangeClient";

export const dynamic = "force-dynamic";

export default async function ChangeAmount({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t = "" } = await searchParams;
  const found = await loadOrder(id, t);
  if (!found) notFound();
  const { order: o, garment: g } = found;
  const back = `/o/${o.id}?t=${o.accessToken}`;
  if (o.status !== "awaiting_payment") {
    return (
      <>
        <div className="top"><Link href={back} className="back">Back</Link></div>
        <div className="res"><h1>This hold is no longer open.</h1></div>
        <div className="actions"><Link href={back} className="btn">See where it stands</Link></div>
      </>
    );
  }
  return (
    <>
      <div className="top"><Link href={back} className="back">Back</Link><span className="tiny">{g.name}</span></div>
      <ChangeClient orderId={o.id} token={o.accessToken} amountCents={o.amountCents} how={o.handoverMethod} yoursFor={NAME_IS_YOURS_FOR} locality={LOCALITY} />
    </>
  );
}
