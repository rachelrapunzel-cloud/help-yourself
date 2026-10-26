import Link from "next/link";
import { LOCALITY, NAME_IS_YOURS_FOR, OWNER_LABELS, SHOP_NAME, SHOW_SPECIMENS } from "@/lib/config";
import { listGarments, type ListedGarment } from "@/lib/orders";

export const dynamic = "force-dynamic";

function Card({ g, fits }: { g: ListedGarment; fits: boolean }) {
  const dim = !fits || g.status === "allocated";
  const over = g.status === "allocated" ? "Gone" : g.status === "held" ? `On hold, ${g.minutesLeft ?? "a few"} min` : null;
  return (
    <Link href={`/g/${g.id}`} className={"card" + (fits ? "" : " faded")}>
      <div className={"ph" + (dim ? " dim" : "")}>
        photo to come
        {over && <div className="over">{over}</div>}
      </div>
      <div className="t">{g.name}</div>
      <div className="m">
        Size {g.size}
        {g.status === "available" && g.condition ? ` · ${g.condition}` : ""}
      </div>
    </Link>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ size?: string }> }) {
  const { size = "all" } = await searchParams;
  const all = await listGarments(SHOW_SPECIMENS);
  const sizes = ["all", ...Array.from(new Set(all.map((g) => g.size)))];
  const owners = Object.keys(OWNER_LABELS);
  return (
    <>
      <div className="name">{SHOP_NAME}</div>
      <div className="lead">
        {NAME_IS_YOURS_FOR ? (
          <>
            Clothes we don&rsquo;t wear any more. <b>Yours for whatever you like, including nothing.</b> You just have to get it home.
          </>
        ) : (
          <>
            Clothes we don&rsquo;t wear any more. Take what you&rsquo;d wear, <b>give what you like, including nothing</b>, and get it home yourself.
          </>
        )}
      </div>
      <div className="sub">One garment at a time. No account. Pick up in {LOCALITY}, or book your own courier.</div>
      <div className="filters">
        {sizes.map((s) => (
          <Link key={s} href={s === "all" ? "/" : `/?size=${encodeURIComponent(s)}`} className={size === s ? "on" : ""}>
            {s === "all" ? "All sizes" : s}
          </Link>
        ))}
      </div>
      {owners.map((o) => {
        const list = all.filter((g) => g.owner === o);
        if (!list.length) return null;
        const avail = list.filter((g) => g.status === "available").length;
        return (
          <section key={o}>
            <div className="sect">
              <span>{OWNER_LABELS[o]}</span>
              <span>{avail} available</span>
            </div>
            <div className="grid">
              {list.map((g) => (
                <Card key={g.id} g={g} fits={size === "all" || g.size === size} />
              ))}
            </div>
          </section>
        );
      })}
      <div className="foot">
        Gone means someone has it. On hold means someone is deciding; it comes back if they don&rsquo;t finish.
        {SHOW_SPECIMENS && (
          <>
            <br />
            <br />
            Specimen content: no real garments or photos yet.
          </>
        )}
      </div>
    </>
  );
}
