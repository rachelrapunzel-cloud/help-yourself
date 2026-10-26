"use client";
// Shared by "take this" (creates the hold) and "change the amount" (updates an open order).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MIN_CARD = 50;
const LARGE = 20000;
const money = (c: number) => "$" + (c / 100).toFixed(2);

export type AmountSubmit = (amountCents: number, how: "pickup" | "courier") => Promise<{ url?: string; error?: string }>;

export default function AmountForm(props: {
  yoursFor: boolean;
  locality: string;
  initialAmountCents?: number;
  initialHow?: "pickup" | "courier";
  lockHow?: boolean;
  onSubmit: AmountSubmit;
}) {
  const router = useRouter();
  const [val, setVal] = useState(props.initialAmountCents != null ? (props.initialAmountCents / 100).toString() : "");
  const [how, setHow] = useState<"pickup" | "courier" | null>(props.initialHow ?? null);
  const [sheet, setSheet] = useState<null | { kind: "under"; cents: number } | { kind: "large"; cents: number }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const parse = (): number | null => {
    const v = val.trim();
    if (v === "" || v === "." || !/^\d{0,5}(\.\d{0,2})?$/.test(v)) return null;
    return Math.round(Number(v) * 100);
  };
  const cents = parse();
  const button = props.yoursFor ? (cents == null ? "Continue" : cents < MIN_CARD ? "Yours for nothing" : "Yours for " + money(cents)) : "Continue";

  async function go(c: number) {
    if (!how) return;
    setBusy(true);
    const r = await props.onSubmit(c, how);
    setBusy(false);
    if (r.error) setToast(r.error);
    else if (r.url) router.push(r.url);
  }

  function submit() {
    const c = parse();
    if (c == null) {
      setToast("Type an amount. 0 is fine.");
      inputRef.current?.focus();
      return;
    }
    if (!how) {
      setToast("Choose pick up or courier.");
      return;
    }
    if (c > 0 && c < MIN_CARD) return setSheet({ kind: "under", cents: c });
    if (c >= LARGE) return setSheet({ kind: "large", cents: c });
    void go(c);
  }

  return (
    <>
      <div className="q">
        <h2>{props.yoursFor ? "Yours for…" : "What would you like to give for it?"}</h2>
        <p>Any amount. 0 is fine. Nothing else changes depending on the number.</p>
      </div>
      <div className="amount">
        <span>$</span>
        <input
          ref={inputRef}
          inputMode="decimal"
          placeholder="0"
          autoComplete="off"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="hint">NZD. Cards can&rsquo;t take less than 50 cents, so anything under that becomes a free claim.</div>
      <div className="choose">
        <div className="lab">Getting it home</div>
        <button type="button" className={"opt" + (how === "pickup" ? " on" : "")} onClick={() => !props.lockHow && setHow("pickup")}>
          <i />
          <div>
            <b>I&rsquo;ll pick it up</b>
            <small>{props.locality}. Left on the doorstep for you. Exact address once it&rsquo;s yours.</small>
          </div>
        </button>
        <button type="button" className={"opt" + (how === "courier" ? " on" : "")} onClick={() => !props.lockHow && setHow("courier")}>
          <i />
          <div>
            <b>I&rsquo;ll book a courier</b>
            <small>You book and pay for it. We pack it. About a shoebox, under 1 kg.</small>
          </div>
        </button>
      </div>
      <div className="cta">
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "One moment" : button}
        </button>
      </div>

      <div className={"scrim" + (sheet ? " on" : "")} onClick={() => setSheet(null)} />
      <div className={"sheet" + (sheet ? " on" : "")}>
        {sheet?.kind === "under" && (
          <>
            <h3>That becomes a free claim</h3>
            <p>
              The card provider can&rsquo;t take less than 50 cents. {money(sheet.cents)} can&rsquo;t be charged, so it would go through as $0, with no card step. Or make it $0.50.
            </p>
            <button className="btn" onClick={() => { setSheet(null); setVal("0"); void go(0); }}>Claim it for $0</button>
            <button className="btn line" onClick={() => { setSheet(null); setVal("0.50"); void go(50); }}>Make it $0.50</button>
            <button className="btn text" onClick={() => setSheet(null)}>Change the amount</button>
          </>
        )}
        {sheet?.kind === "large" && (
          <>
            <h3>{money(sheet.cents)}, just checking</h3>
            <p>That&rsquo;s a lot for one garment. If it&rsquo;s what you meant, carry on.</p>
            <button className="btn" onClick={() => { const c = sheet.cents; setSheet(null); void go(c); }}>Yes, {money(sheet.cents)}</button>
            <button className="btn line" onClick={() => setSheet(null)}>Change it</button>
          </>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
