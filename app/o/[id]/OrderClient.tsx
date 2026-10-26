"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const money = (c: number) => "$" + (c / 100).toFixed(2);

function useLeft(expires: string) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(expires).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((new Date(expires).getTime() - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [expires]);
  return left;
}
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function Countdown({ expires, statusUrl }: { expires: string; statusUrl: string }) {
  const left = useLeft(expires);
  const router = useRouter();
  useEffect(() => {
    if (left === 0) {
      const t = setTimeout(() => router.replace(statusUrl), 1500);
      return () => clearTimeout(t);
    }
  }, [left, router, statusUrl]);
  return <>{fmt(left)}</>;
}

export function HoldForm({ orderId, token, email: initial, amountCents, retry }: { orderId: string; token: string; email: string; amountCents: number; retry: boolean }) {
  const [email, setEmail] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const label = amountCents === 0 ? "Claim it" : retry ? `Try the card again, ${money(amountCents)}` : `Pay ${money(amountCents)}`;

  async function go() {
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("We need an email for the pickup details.");
    setBusy(true);
    const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, accessToken: token, email: email.trim() }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Something went wrong.");
      if (j.code === "hold_expired" || j.code === "not_open") router.refresh();
      return;
    }
    if (j.kind === "pay") window.location.href = j.url; // Stripe-hosted page
    else router.push(j.url);
  }

  return (
    <>
      <div className="field">
        <label htmlFor="email">Email for the pickup details</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        <small>Used for this garment only.</small>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="cta">
        <button className="btn" onClick={go} disabled={busy}>{busy ? "One moment" : label}</button>
      </div>
    </>
  );
}

export function Checking({ statusUrl, orderId, token, expires }: { statusUrl: string; orderId: string; token: string; expires: string }) {
  const router = useRouter();
  const left = useLeft(expires);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/order-status?id=${orderId}&t=${token}`, { cache: "no-store" });
      const j = await r.json();
      if (stop) return;
      if (j.status !== "awaiting_payment") router.replace(statusUrl);
      else setTries((n) => n + 1);
    };
    const t = setInterval(tick, 2500);
    void tick();
    return () => { stop = true; clearInterval(t); };
  }, [orderId, token, router, statusUrl]);
  return (
    <div className="checking">
      Checking<span className="dots" />
      <br />
      <span style={{ color: "#666" }}>
        Your hold stands for {fmt(left)} while we look. You can close this; the email will say what happened.
        {tries > 8 && <> If you paid and this doesn&rsquo;t change, nothing is lost: we reconcile every few minutes and the email will confirm.</>}
      </span>
    </div>
  );
}

export function ReleaseButton({ orderId, token }: { orderId: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn text"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, accessToken: token }) });
        router.push("/");
      }}
    >
      Let it go back to the list
    </button>
  );
}
