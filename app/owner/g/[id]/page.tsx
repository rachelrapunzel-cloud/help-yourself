import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isOwner } from "@/lib/owner";
import { photosFor } from "@/lib/photos";
import { garments } from "@/lib/schema";
import { OWNER_LABELS } from "@/lib/config";
import { deletePhoto, republish, saveGarment, setGarmentStatus } from "../../actions";

export const dynamic = "force-dynamic";

const F = ({ name, label, value, hint }: { name: string; label: string; value?: string; hint?: string }) => (
  <div className="field" style={{ marginTop: 14 }}>
    <label htmlFor={name}>{label}</label>
    <input id={name} name={name} defaultValue={value ?? ""} />
    {hint && <small>{hint}</small>}
  </div>
);

export default async function EditGarment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  if (!(await isOwner())) redirect("/owner/login");
  const { id } = await params;
  const { err } = await searchParams;
  const db = await getDb();
  const isNew = id === "new";
  const [g] = isNew ? [null] : await db.select().from(garments).where(eq(garments.id, id));
  if (!isNew && !g) redirect("/owner");
  const pics = g ? (await photosFor(db, [g.id], false)).get(g.id) ?? [] : [];

  return (
    <>
      <div className="top"><Link href="/owner" className="back">Owner</Link>{g && <span className="tiny">{g.status}</span>}</div>
      <div className="ttl">{isNew ? "Add a garment" : g!.name}</div>
      {err && <div className="err">{err === "photo-too-big" ? "Photos need to be under 8 MB." : "Name and size are needed."}</div>}

      {g && (
        <div className="thumbs" style={{ flexWrap: "wrap" }}>
          {pics.map((p) => (
            <form key={p.id} action={deletePhoto} style={{ position: "relative" }}>
              <input type="hidden" name="photoId" value={p.id} /><input type="hidden" name="garmentId" value={g.id} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" style={{ width: 88, height: 110, objectFit: "cover", display: "block" }} />
              <button className="tiny" style={{ position: "absolute", right: 2, top: 2, background: "#fff", padding: "0 4px" }}>×</button>
            </form>
          ))}
        </div>
      )}

      <form action={saveGarment} encType="multipart/form-data">
        <input type="hidden" name="id" value={g?.id ?? ""} />
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="owner">Section</label>
          <select id="owner" name="owner" defaultValue={g?.owner ?? Object.keys(OWNER_LABELS)[0]} style={{ width: "100%", padding: 12, font: "inherit", border: "1px solid #bbb", background: "#fff" }}>
            {Object.entries(OWNER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <F name="name" label="Name" value={g?.name} hint="What it is and its colour. No brands needed." />
        <F name="size" label="Size" value={g?.size} />
        <F name="fit" label="Fit" value={g?.fit} hint="How it actually fits. 'Relaxed cut. Fits a 10 to 12.'" />
        <F name="measurements" label="Measurements" value={g?.measurements} hint="Pit to pit, length, waist. Centimetres." />
        <F name="condition" label="Condition" value={g?.condition} />
        <F name="flaws" label="Flaws" value={g?.flaws} hint="Say what's wrong and which photo shows it. 'None found.' is fine." />
        <F name="sort" label="Order on the page" value={String(g?.sort ?? 0)} hint="Lower numbers first." />
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="photo">Add a photo</label>
          <input id="photo" name="photo" type="file" accept="image/*" />
          <small>One at a time. First photo is the main one.</small>
        </div>
        <div className="cta"><button className="btn">{isNew ? "Save as draft" : "Save"}</button></div>
      </form>

      {g && (
        <div className="actions" style={{ paddingTop: 0 }}>
          {g.status === "draft" && pics.length === 0 && <div className="tiny">Add at least one photo before publishing.</div>}
          {(g.status === "draft" || g.status === "withdrawn") && (
            <form action={setGarmentStatus}><input type="hidden" name="id" value={g.id} /><button name="to" value="available" className="btn" disabled={pics.length === 0 && !g.specimen}>Publish</button></form>
          )}
          {g.status === "available" && (
            <form action={setGarmentStatus}><input type="hidden" name="id" value={g.id} /><button name="to" value="withdrawn" className="btn line">Withdraw from the list</button></form>
          )}
          {g.status === "held" && <div className="tiny">On hold by a buyer right now. It comes back by itself if they don&rsquo;t finish.</div>}
          {g.status === "allocated" && (
            <form action={republish}><input type="hidden" name="id" value={g.id} /><button className="btn line">It&rsquo;s back with me, republish it</button></form>
          )}
        </div>
      )}
    </>
  );
}
