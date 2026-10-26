// Shop configuration. Everything here is a setting, not a design decision.
// Private details (address, phone) come only from server env and are never
// rendered on a public page.

export const SHOP_NAME = process.env.SHOP_NAME ?? "Help Yourself";
export const NAME_IS_YOURS_FOR = SHOP_NAME.trim().toLowerCase() === "yours for";

export const LOCALITY = process.env.LOCALITY ?? "Your suburb";
export const CITY = process.env.CITY ?? "Auckland";

// Sections on the list page. Keys are stored on each garment as `owner`;
// labels are what visitors see. Set OWNER_LABELS as "key=Label,key=Label".
export const OWNER_LABELS: Record<string, string> = Object.fromEntries(
  (process.env.OWNER_LABELS ?? "a=Mine,b=Theirs").split(",").map((pair) => {
    const [k, ...rest] = pair.split("=");
    return [k.trim(), rest.join("=").trim()];
  }),
);

export const HOLD_MINUTES = Number(process.env.HOLD_MINUTES ?? 30);
export const MIN_CARD_CENTS = 50; // Stripe's NZD minimum charge, not a garment value
export const LARGE_CENTS = 20000; // ask "just checking" at or above this
export const MAX_CENTS = 100000;
export const GONE_VISIBLE_HOURS = 24; // allocated garments stay listed as "gone" this long

export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Server-only. Shown on the private status page after allocation.
export function privateHandover() {
  return {
    address: process.env.PICKUP_ADDRESS ?? `12 Specimen Street\n${LOCALITY}, ${CITY}\n(specimen address)`,
    // How a pick-up actually happens. Keep it literal.
    pickupNote: process.env.PICKUP_NOTE ?? "It'll be left on the doorstep in a brown paper bag with your name on the front.",
    parcel: process.env.PARCEL_NOTE ?? "about 30 × 25 × 8 cm, under 1 kg",
  };
}

export const SHOW_SPECIMENS = process.env.SHOW_SPECIMENS === "1" || process.env.NODE_ENV !== "production";
