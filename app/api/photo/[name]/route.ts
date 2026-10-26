import { readLocalPhoto } from "@/lib/photos";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const buf = await readLocalPhoto(name);
  if (!buf) return new Response("not found", { status: 404 });
  const ext = name.split(".").pop();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
}
