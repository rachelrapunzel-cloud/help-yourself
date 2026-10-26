import { pgTable, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export type GarmentStatus = "draft" | "available" | "held" | "allocated" | "withdrawn";
export type OrderStatus =
  | "awaiting_payment"
  | "no_payment_required"
  | "paid"
  | "expired"
  | "released"
  | "refund_pending"
  | "refunded"
  | "exception";
export type HandoverStatus = "awaiting_arrangement" | "ready" | "completed" | "cancelled";

export const garments = pgTable("garments", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  size: text("size").notNull(),
  fit: text("fit").notNull().default(""),
  measurements: text("measurements").notNull().default(""),
  condition: text("condition").notNull().default(""),
  flaws: text("flaws").notNull().default(""),
  status: text("status").$type<GarmentStatus>().notNull().default("draft"),
  specimen: boolean("specimen").notNull().default(false),
  sort: integer("sort").notNull().default(0),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const photos = pgTable("photos", {
  id: text("id").primaryKey(),
  garmentId: text("garment_id").notNull().references(() => garments.id),
  url: text("url").notNull(),
  position: integer("position").notNull().default(0),
  approved: boolean("approved").notNull().default(false),
});

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    garmentId: text("garment_id").notNull().references(() => garments.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("nzd"),
    handoverMethod: text("handover_method").$type<"pickup" | "courier">().notNull(),
    email: text("email"),
    status: text("status").$type<OrderStatus>().notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }).notNull(),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    sessionAttempt: integer("session_attempt").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    accessToken: text("access_token").notNull().unique(),
    exceptionNote: text("exception_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_garment_status").on(t.garmentId, t.status)],
);

export const handovers = pgTable("handovers", {
  orderId: text("order_id").primaryKey().references(() => orders.id),
  status: text("status").$type<HandoverStatus>().notNull().default("awaiting_arrangement"),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const mails = pgTable("mails", {
  id: text("id").primaryKey(),
  orderId: text("order_id").references(() => orders.id),
  kind: text("kind").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export type Garment = typeof garments.$inferSelect;
export type Order = typeof orders.$inferSelect;
