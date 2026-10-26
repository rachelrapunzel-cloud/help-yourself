"use client";
import AmountForm from "@/components/AmountForm";

export default function ChangeClient(p: { orderId: string; token: string; amountCents: number; how: "pickup" | "courier"; yoursFor: boolean; locality: string }) {
  return (
    <AmountForm
      yoursFor={p.yoursFor}
      locality={p.locality}
      initialAmountCents={p.amountCents}
      initialHow={p.how}
      lockHow
      onSubmit={async (amountCents) => {
        const r = await fetch("/api/amount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: p.orderId, accessToken: p.token, amountCents }),
        });
        const j = await r.json();
        if (!r.ok) return { error: j.error ?? "Something went wrong." };
        return { url: j.url };
      }}
    />
  );
}
