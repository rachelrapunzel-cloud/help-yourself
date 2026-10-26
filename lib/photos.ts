// Photo storage: Vercel Blob when a token is present, otherwise ./data/uploads
// served through /api/photo/[name] for local development.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { eq, inArray, asc } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { photos } from "./schema";

const DIR = path.join(process.cwd(), "data", "uploads");

export async function storePhoto(file: File): Promise<string> {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const name = `${randomUUID()}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const r = await put(`garments/${name}`, file, { access: "public", addRandomSuffix: false });
    return r.url;
  }
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), Buffer.from(await file.arrayBuffer()));
  return `/api/photo/${name}`;
}

export async function readLocalPhoto(name: string) {
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/.test(name)) return null;
  try {
    return await readFile(path.join(DIR, name));
  } catch {
    return null;
  }
}

export async function addPhoto(garmentId: string, url: string) {
  const db = await getDb();
  const existing = await db.select({ id: photos.id }).from(photos).where(eq(photos.garmentId, garmentId));
  await db.insert(photos).values({ id: randomUUID(), garmentId, url, position: existing.length, approved: true });
}

export async function removePhoto(id: string) {
  const db = await getDb();
  await db.delete(photos).where(eq(photos.id, id));
}

export type PhotoRow = typeof photos.$inferSelect;

export async function photosFor(db: Db, garmentIds: string[], approvedOnly = true): Promise<Map<string, PhotoRow[]>> {
  const m = new Map<string, PhotoRow[]>();
  if (!garmentIds.length) return m;
  const rows = await db.select().from(photos).where(inArray(photos.garmentId, garmentIds)).orderBy(asc(photos.position));
  for (const p of rows) {
    if (approvedOnly && !p.approved) continue;
    if (!m.has(p.garmentId)) m.set(p.garmentId, []);
    m.get(p.garmentId)!.push(p);
  }
  return m;
}
