"use client";
import AmountForm from "@/components/AmountForm";

export default function TakeClient({ garmentId, yoursFor, locality }: { garmentId: string; yoursFor: boolean; locality: string }) {
  return (
    <AmountForm
      yoursFor={yoursFor}
      locality={locality}
      onSubmit={async (amountCents, handoverMethod) => {
        const r = await fetch("/api/hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ garmentId, amountCents, handoverMethod }),
        });
        const j = await r.json();
        if (!r.ok) return { error: j.error ?? "Something went wrong." };
        return { url: j.url };
      }}
    />
  );
}
