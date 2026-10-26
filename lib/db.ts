// One database handle. Postgres (Neon) when DATABASE_URL is set; otherwise an
// embedded Postgres (PGlite) in ./data for local development. Both are real
// Postgres, so SELECT ... FOR UPDATE and transactions behave the same.
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS garments (
  id text PRIMARY KEY,
  owner text NOT NULL,
  name text NOT NULL,
  size text NOT NULL,
  fit text NOT NULL DEFAULT '',
  measurements text NOT NULL DEFAULT '',
  condition text NOT NULL DEFAULT '',
  flaws text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  specimen boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS photos (
  id text PRIMARY KEY,
  garment_id text NOT NULL REFERENCES garments(id),
  url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  approved boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  garment_id text NOT NULL REFERENCES garments(id),
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'nzd',
  handover_method text NOT NULL,
  email text,
  status text NOT NULL,
  hold_expires_at timestamptz NOT NULL,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  session_attempt integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  access_token text NOT NULL UNIQUE,
  exception_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_garment_status ON orders(garment_id, status);
CREATE TABLE IF NOT EXISTS handovers (
  order_id text PRIMARY KEY REFERENCES orders(id),
  status text NOT NULL DEFAULT 'awaiting_arrangement',
  notes text,
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE TABLE IF NOT EXISTS mails (
  id text PRIMARY KEY,
  order_id text REFERENCES orders(id),
  kind text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
`;

type G = typeof globalThis & { __hbDb?: Promise<Db> };
const g = globalThis as G;

async function create(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const ws = (await import("ws")).default;
    neonConfig.webSocketConstructor = ws;
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema }) as unknown as Db;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(process.env.PGLITE_DIR ?? "./data/pglite");
    db = drizzle(client, { schema }) as unknown as Db;
  }
  for (const stmt of SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt));
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__hbDb) g.__hbDb = create();
  return g.__hbDb;
}
