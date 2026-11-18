"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ActionState } from "@/components/app/action-types";
import { UiError, guard, optText, parseForm, str } from "@/components/app/action-utils";
import { REF_COOKIE, actionCtx, getAppContext, setCompanyCookie } from "@/components/app/data";
import { safeNext } from "@/components/app/safe";
import { db, schema } from "@/server/db";
import { addStaff, createCompany, createProgram, createReward, createVenue } from "@/server/loyalty/service";
import { cancelSubscription } from "@/server/payments/service";

const id = z.string().min(1).max(64);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет должен быть в формате #RRGGBB");
const logo = z
  .string()
  .max(200 * 1024, "Логотип слишком большой (до 200 КБ)")
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Неподдерживаемый формат логотипа");

function done(fd: FormData, ok: string, paths: string[]): ActionState {
  for (const p of paths) revalidatePath(p);
  const next = safeNext(str(fd, "next"), "");
  if (next) redirect(next);
  return { ok };
}

export async function switchCompanyAction(fd: FormData): Promise<void> {
  const wanted = str(fd, "companyId");
  const { memberships } = await getAppContext();
  if (memberships.some((m) => m.company.id === wanted)) await setCompanyCookie(wanted);
  redirect("/app");
}

// ---- company ----
const companySchema = z.object({
  name: z.string().trim().min(2, "Название — от 2 символов").max(80, "Название слишком длинное"),
  country: z.enum(["RU", "BY"], { message: "Выберите страну" }),
  taxId: z.string().optional().transform(optText(20)),
  legalName: z.string().optional().transform(optText(120)),
});

function checkTaxId(country: "RU" | "BY", taxId?: string) {
  if (!taxId) return;
  const ok = country === "RU" ? /^\d{10}(\d{2})?$/.test(taxId) : /^\d{9}$/.test(taxId);
  if (!ok) throw new UiError(country === "RU" ? "ИНН — 10 или 12 цифр" : "УНП — 9 цифр");
}

export async function createCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const { user } = await getAppContext();
    const v = parseForm(companySchema, fd);
    checkTaxId(v.country, v.taxId);
    const jar = await cookies();
    const ref = jar.get(REF_COOKIE)?.value;
    const company = await createCompany(user.id, {
      name: v.name,
      country: v.country,
      legalName: v.legalName,
      taxId: v.taxId,
      referralCode: ref && /^[\w-]{4,64}$/.test(ref) ? ref : undefined,
    });
    if (ref) jar.delete(REF_COOKIE);
    await setCompanyCookie(company.id);
  });
  if (!r.ok) return { error: r.error, upsell: r.upsell };
  redirect("/app/onboarding");
}

export async function updateCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const companyId = str(fd, "companyId");
    const { company } = await actionCtx(companyId, ["OWNER"]);
    const v = parseForm(companySchema.omit({ country: true }), fd);
    checkTaxId(company.country, v.taxId);
    await db
      .update(schema.companies)
      .set({ name: v.name, legalName: v.legalName ?? null, taxId: v.taxId ?? null })
      .where(eq(schema.companies.id, company.id));
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app", "layout");
  return { ok: "Сохранено" };
}

// ---- venues ----
const venueSchema = z.object({
  companyId: id,
  name: z.string().trim().min(2, "Название — от 2 символов").max(80),
  address: z.string().optional().transform(optText(160)),
  brandColor: z.string().optional().transform((v) => (v ? v : undefined)).pipe(hex.optional()),
  logoUrl: z.string().optional().transform((v) => (v ? v : undefined)).pipe(logo.optional()),
});

export async function createVenueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(venueSchema, fd);
    const { limits } = await actionCtx(v.companyId);
    const branded = !!v.logoUrl || (!!v.brandColor && v.brandColor.toLowerCase() !== "#39ff88");
    if (branded && !limits.customBranding) throw new UiError("Свой логотип и цвет доступны на платных тарифах.", true);
    await createVenue(v.companyId, {
      name: v.name,
      address: v.address,
      brandColor: limits.customBranding ? v.brandColor : undefined,
      logoUrl: limits.customBranding ? v.logoUrl : undefined,
    });
  });
  if (!r.ok) return { error: r.error, upsell: r.upsell };
  return done(fd, "Заведение создано", ["/app/venues", "/app/qr", "/app"]);
}

export async function updateVenueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(venueSchema.extend({ venueId: id }), fd);
    const { limits } = await actionCtx(v.companyId);
    const patch: Partial<typeof schema.venues.$inferInsert> = { name: v.name, address: v.address ?? null };
    if (limits.customBranding) {
      if (v.brandColor) patch.brandColor = v.brandColor;
      patch.logoUrl = v.logoUrl ?? null;
    }
    const res = await db
      .update(schema.venues)
      .set(patch)
      .where(and(eq(schema.venues.id, v.venueId), eq(schema.venues.companyId, v.companyId)))
      .returning({ id: schema.venues.id });
    if (res.length === 0) throw new UiError("Заведение не найдено");
  });
  if (!r.ok) return { error: r.error, upsell: r.upsell };
  return done(fd, "Сохранено", ["/app/venues", "/app/qr"]);
}

// ---- programs ----
const programSchema = z.object({
  companyId: id,
  venueId: id,
  type: z.enum(["STAMPS", "POINTS"], { message: "Выберите тип программы" }),
  name: z.string().trim().min(2, "Название — от 2 символов").max(80),
  stampsRequired: z.coerce.number().int().min(2, "Штампов — не меньше 2").max(40, "Штампов — не больше 40").default(10),
  pointsPercent: z.coerce.number().int().min(1, "Процент — от 1").max(50, "Процент — не больше 50").default(5),
  rewardText: z.string().trim().min(2, "Опишите награду").max(120),
});

export async function createProgramAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(programSchema, fd);
    const { limits } = await actionCtx(v.companyId);
    if (v.type === "POINTS" && !limits.pointsPrograms) {
      throw new UiError("Программа с баллами (% от покупки) доступна на тарифах PRO и TOP.", true);
    }
    await createProgram(v.companyId, {
      venueId: v.venueId,
      type: v.type,
      name: v.name,
      stampsRequired: v.type === "STAMPS" ? v.stampsRequired : undefined,
      pointsPercent: v.type === "POINTS" ? v.pointsPercent : undefined,
      rewardText: v.rewardText,
    });
  });
  if (!r.ok) return { error: r.error, upsell: r.upsell };
  return done(fd, "Программа создана", ["/app/programs", "/app/scan", "/app"]);
}

export async function updateProgramAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(
      programSchema.omit({ venueId: true, type: true }).extend({ programId: id, active: z.string().optional() }),
      fd,
    );
    await actionCtx(v.companyId);
    const res = await db
      .update(schema.programs)
      .set({
        name: v.name,
        rewardText: v.rewardText,
        stampsRequired: v.stampsRequired,
        pointsPercent: v.pointsPercent,
        active: v.active === "on",
      })
      .where(and(eq(schema.programs.id, v.programId), eq(schema.programs.companyId, v.companyId)))
      .returning({ id: schema.programs.id });
    if (res.length === 0) throw new UiError("Программа не найдена");
  });
  if (!r.ok) return { error: r.error };
  return done(fd, "Сохранено", ["/app/programs", "/app/scan"]);
}

const rewardSchema = z.object({
  companyId: id,
  programId: id,
  title: z.string().trim().min(2, "Название награды — от 2 символов").max(80),
  cost: z.coerce.number().int().min(1, "Стоимость — от 1").max(1_000_000),
});

export async function createRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(rewardSchema, fd);
    const { limits } = await actionCtx(v.companyId);
    if (!limits.rewards) throw new UiError("Каталог наград доступен на платных тарифах.", true);
    await createReward(v.companyId, { programId: v.programId, title: v.title, cost: v.cost });
  });
  if (!r.ok) return { error: r.error, upsell: r.upsell };
  return done(fd, "Награда добавлена", ["/app/programs", "/app/scan"]);
}

export async function deactivateRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const companyId = str(fd, "companyId");
    await actionCtx(companyId);
    await db
      .update(schema.rewards)
      .set({ active: false })
      .where(and(eq(schema.rewards.id, str(fd, "rewardId")), eq(schema.rewards.companyId, companyId)));
  });
  if (!r.ok) return { error: r.error };
  return done(fd, "Награда скрыта", ["/app/programs", "/app/scan"]);
}

// ---- staff ----
const staffSchema = z.object({
  companyId: id,
  email: z.string().trim().toLowerCase().pipe(z.email("Введите корректный email")),
  role: z.enum(["MANAGER", "STAFF"], { message: "Выберите роль" }),
  venueId: z.string().optional().transform((v) => (v ? v : undefined)),
});

export async function addStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(staffSchema, fd);
    const { limits } = await actionCtx(v.companyId, ["OWNER"]);
    if (limits.staff <= 0) throw new UiError("Сотрудники доступны на платных тарифах.", true);
    if (v.venueId) {
      const own = await db
        .select({ id: schema.venues.id })
        .from(schema.venues)
        .where(and(eq(schema.venues.id, v.venueId), eq(schema.venues.companyId, v.companyId)));
      if (own.length === 0) throw new UiError("Заведение не найдено");
    }
    await addStaff(v.companyId, { email: v.email, role: v.role, venueId: v.venueId });
  });
  if (!r.ok) return { error: r.error, upsell: r.upsell };
  return done(fd, "Сотрудник добавлен", ["/app/staff"]);
}

export async function removeStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const companyId = str(fd, "companyId");
    await actionCtx(companyId, ["OWNER"]);
    const rows = await db
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.id, str(fd, "membershipId")), eq(schema.memberships.companyId, companyId)));
    const m = rows[0];
    if (!m) throw new UiError("Сотрудник не найден");
    if (m.role === "OWNER") throw new UiError("Нельзя удалить владельца");
    await db.delete(schema.memberships).where(eq(schema.memberships.id, m.id));
  });
  if (!r.ok) return { error: r.error };
  return done(fd, "Сотрудник удалён", ["/app/staff"]);
}

// ---- billing ----
export async function cancelSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const companyId = str(fd, "companyId");
    await actionCtx(companyId, ["OWNER"]);
    await cancelSubscription(companyId);
  });
  if (!r.ok) return { error: r.error };
  return done(fd, "Автопродление отключено. Тариф действует до конца оплаченного периода.", ["/app/billing"]);
}
