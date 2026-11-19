// QRonus data model (Drizzle). Every business-owned row carries companyId for tenant isolation.
import { sql } from "drizzle-orm";
import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, serial, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "./id";

export const country = pgEnum("country", ["RU", "BY"]);
export const currency = pgEnum("currency", ["RUB", "BYN"]);
export const plan = pgEnum("plan", ["FREE", "PRO", "TOP"]);
export const platformRole = pgEnum("platform_role", ["USER", "ADMIN"]);
export const memberRole = pgEnum("member_role", ["OWNER", "MANAGER", "STAFF"]);
export const programType = pgEnum("program_type", ["STAMPS", "POINTS"]);
export const txType = pgEnum("tx_type", ["ACCRUE", "REDEEM", "ADJUST", "REFERRAL_BONUS"]);
export const subStatus = pgEnum("subscription_status", ["ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"]);
export const payStatus = pgEnum("payment_status", ["PENDING", "PAID", "FAILED", "CANCELED", "REFUNDED"]);
export const refStatus = pgEnum("referral_status", ["PENDING", "CONFIRMED", "REWARDED"]);

const id = () => text("id").primaryKey().$defaultFn(createId);
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  phone: text("phone"),
  platformRole: platformRole("platform_role").notNull().default("USER"),
  country: country("country").notNull().default("RU"),
  inviteCode: text("invite_code").notNull().unique().$defaultFn(createId),
  invitedByCode: text("invited_by_code"),
  createdAt: created(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(token); raw token lives only in the httpOnly cookie
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: created(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const consents = pgTable("consents", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // pd_processing | terms | marketing
  version: text("version").notNull(),
  grantedAt: created(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  country: country("country").notNull(),
  currency: currency("currency").notNull(),
  plan: plan("plan").notNull().default("FREE"),
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  legalName: text("legal_name"),
  taxId: text("tax_id"), // ИНН (RU) / УНП (BY)
  referralCode: text("referral_code").notNull().unique().$defaultFn(createId),
  referredById: text("referred_by_id"),
  createdAt: created(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const memberships = pgTable("memberships", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull(),
  venueId: text("venue_id"), // STAFF may be restricted to one venue
  createdAt: created(),
}, (t) => [uniqueIndex("memberships_user_company").on(t.userId, t.companyId), index("memberships_company_idx").on(t.companyId)]);

export const venues = pgTable("venues", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  address: text("address"),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").notNull().default("#39FF88"),
  createdAt: created(),
}, (t) => [index("venues_company_idx").on(t.companyId)]);

export const programs = pgTable("programs", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  venueId: text("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
  type: programType("type").notNull(),
  name: text("name").notNull(),
  stampsRequired: integer("stamps_required").notNull().default(10),
  pointsPercent: integer("points_percent").notNull().default(5),
  rewardText: text("reward_text").notNull().default("Подарок"),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
}, (t) => [index("programs_company_idx").on(t.companyId)]);

export const rewards = pgTable("rewards", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  cost: integer("cost").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

export const cards = pgTable("cards", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => programs.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: created(),
}, (t) => [
  uniqueIndex("cards_program_customer").on(t.programId, t.customerId),
  index("cards_company_idx").on(t.companyId),
  // Both the wallet and full history begin by resolving a user's cards.
  index("cards_customer_idx").on(t.customerId),
]);

/** Short-lived one-time token shown as the customer's QR; staff scans it to accrue/redeem. */
export const customerTokens = pgTable("customer_tokens", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: created(),
});

/** One-time password reset links (sha256 stored; raw token only in the emailed link). */
export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: created(),
});

export const transactions = pgTable("transactions", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  type: txType("type").notNull(),
  amount: integer("amount").notNull(), // signed balance change
  purchaseMinor: integer("purchase_minor"),
  staffUserId: text("staff_user_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  // Nullable only for transactions that predate the intent-fingerprint rollout.
  intentHash: text("intent_hash"),
  note: text("note"),
  createdAt: created(),
}, (t) => [
  index("tx_company_created").on(t.companyId, t.createdAt),
  // Personal history queries keep the newest 20 operations per customer card.
  index("tx_card_history_idx").on(t.cardId, t.createdAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
]);

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  plan: plan("plan").notNull(),
  status: subStatus("status").notNull(),
  provider: text("provider").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("subs_company_idx").on(t.companyId)]);

export const payments = pgTable("payments", {
  id: id(),
  invoiceNo: serial("invoice_no").notNull().unique(), // Robokassa InvId must be integer
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  plan: plan("plan").notNull(),
  months: integer("months").notNull().default(1),
  amountMinor: integer("amount_minor").notNull(),
  currency: currency("currency").notNull(),
  status: payStatus("status").notNull().default("PENDING"),
  testMode: boolean("test_mode").notNull().default(true),
  providerRef: text("provider_ref"),
  checkoutKey: text("checkout_key"),
  checkoutUrl: text("checkout_url"),
  failReason: text("fail_reason"),
  createdAt: created(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  // Manual SBP transfers: customer claims payment, plan is granted for a short grace period until admin confirms.
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  graceApplied: boolean("grace_applied").notNull().default(false),
  prevPlan: plan("prev_plan"),
  prevPlanExpiresAt: timestamp("prev_plan_expires_at", { withTimezone: true }),
  payerInn: text("payer_inn"),
  payerName: text("payer_name"),
  // НПД receipt ("Мой налог") issued automatically on confirmation.
  npdReceiptId: text("npd_receipt_id"),
  npdError: text("npd_error"),
}, (t) => [
  index("payments_company_idx").on(t.companyId),
  index("payments_status_created").on(t.status, t.createdAt),
  uniqueIndex("payments_company_checkout_key").on(t.companyId, t.checkoutKey),
  uniqueIndex("payments_platega_ref").on(t.providerRef).where(sql`${t.provider} = 'platega' AND ${t.providerRef} IS NOT NULL`),
]);

export const paymentEvents = pgTable("payment_events", {
  id: id(),
  provider: text("provider").notNull(),
  eventKey: text("event_key").notNull().unique(), // dedupe: provider:invoice:kind
  paymentId: text("payment_id").references(() => payments.id),
  kind: text("kind").notNull(),
  verified: boolean("verified").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: created(),
});

export const referrals = pgTable("referrals", {
  id: id(),
  referrerCompanyId: text("referrer_company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  referredCompanyId: text("referred_company_id").notNull().unique().references(() => companies.id, { onDelete: "cascade" }),
  status: refStatus("status").notNull().default("PENDING"),
  createdAt: created(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorUserId: text("actor_user_id"),
  companyId: text("company_id"),
  action: text("action").notNull(),
  meta: jsonb("meta"),
  ip: text("ip"),
  createdAt: created(),
}, (t) => [index("audit_company_created").on(t.companyId, t.createdAt), index("audit_action_created").on(t.action, t.createdAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

/** Anonymous funnel analytics — no personal data. */
export const analyticsEvents = pgTable("analytics_events", {
  id: id(),
  type: text("type").notNull(), // page_view | signup_business | first_card | venue_activated | paid | referral_click
  country: country("country"),
  path: text("path"),
  source: text("source"), // organic | referral | direct | qr
  companyId: text("company_id"),
  createdAt: created(),
}, (t) => [index("analytics_type_created").on(t.type, t.createdAt)]);
