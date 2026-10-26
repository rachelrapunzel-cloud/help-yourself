// Seeds the seven specimen garments from the locked front end. Idempotent.
// Specimens are hidden in production unless SHOW_SPECIMENS=1.
import { getDb } from "../lib/db";
import { garments } from "../lib/schema";

const SPECIMENS = [
  { id: "linen", owner: "a", name: "Linen shirt, pale blue", size: "12", fit: "Relaxed cut. Fits a 10 to 12.", measurements: "Pit to pit 54 cm. Length 70 cm. Sleeve 58 cm.", condition: "Worn a handful of times.", flaws: "Faint mark on the left cuff, shown in photo 3.", status: "available", sort: 1 },
  { id: "coat", owner: "a", name: "Wool coat, camel", size: "10", fit: "True to size. Room for a jumper.", measurements: "Shoulder 41 cm. Length 98 cm.", condition: "Two winters. Dry cleaned.", flaws: "One button re-sewn in slightly darker thread.", status: "available", sort: 2 },
  { id: "skirt", owner: "a", name: "Pleated skirt, dark green", size: "12", fit: "Sits at the waist. Elastic at the back.", measurements: "Waist 74 to 82 cm. Length 78 cm.", condition: "Barely worn.", flaws: "None found.", status: "available", sort: 3 },
  { id: "jeans", owner: "b", name: "Straight jeans, mid wash", size: "28", fit: "High waist, straight leg.", measurements: "Waist 72 cm. Inseam 76 cm.", condition: "Worn in.", flaws: "Hem a little frayed.", status: "allocated", sort: 4 },
  { id: "slip", owner: "b", name: "Slip dress, black", size: "8", fit: "Bias cut. Fits an 8.", measurements: "Pit to pit 44 cm. Length 112 cm.", condition: "Worn twice.", flaws: "None.", status: "available", sort: 5 },
  { id: "cardi", owner: "b", name: "Chunky cardigan, cream", size: "S", fit: "Oversized. S to M.", measurements: "Pit to pit 60 cm. Length 64 cm.", condition: "Some bobbling.", flaws: "Bobbling under the arms. Light pull on the back, photo 4.", status: "available", sort: 6 },
  { id: "trainers", owner: "b", name: "Trainers, white", size: "38", fit: "Standard width.", measurements: "Insole 24.5 cm.", condition: "Worn. Cleaned.", flaws: "Scuffed soles.", status: "available", sort: 7 },
] as const;

async function main() {
  const db = await getDb();
  for (const s of SPECIMENS) {
    await db
      .insert(garments)
      .values({ ...s, specimen: true })
      .onConflictDoUpdate({ target: garments.id, set: { name: s.name, size: s.size, fit: s.fit, measurements: s.measurements, condition: s.condition, flaws: s.flaws, sort: s.sort, specimen: true } });
  }
  console.log(`seeded ${SPECIMENS.length} specimen garments`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
