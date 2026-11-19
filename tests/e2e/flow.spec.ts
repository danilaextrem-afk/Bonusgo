import { test, expect, type Page, type Browser } from "@playwright/test";

const PASSWORD = "Passw0rd!test";

async function register(page: Page, email: string, role: "business" | "customer", extra = "") {
  await page.goto(`/register?role=${role}${extra}`);
  await page.fill('input[name="name"]', role === "business" ? "Owner" : "Guest");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.check('input[name="acceptTerms"]');
  await page.check('input[name="acceptPd"]');
  await page.locator('main form button[type="submit"]').last().click();
}

async function createBusiness(page: Page, email: string, withVenueProgram: boolean) {
  await register(page, email, "business", "&country=RU");
  await page.waitForURL(/\/app/);
  await page.goto("/app/onboarding");
  await page.fill('input[name="name"]', "Кофейня Тест");
  await page.locator('main form button[type="submit"]').last().click();
  if (!withVenueProgram) return;
  await expect(page.getByText("Шаг 2 из 4")).toBeVisible();
  await page.fill('input[name="name"]', "Точка на Тверской");
  await page.locator('main form button[type="submit"]').last().click();
  await expect(page.getByText("Шаг 3 из 4")).toBeVisible();
  await page.fill('input[name="stampsRequired"]', "5");
  await page.locator('main form button[type="submit"]').last().click();
  await expect(page.getByText("Шаг 4 из 4")).toBeVisible();
}

async function newCtx(browser: Browser, info: { project: { use: Record<string, unknown> } }) {
  // Unique client IP per context so per-IP rate limits (register: 8/h) don't trip across runs.
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  return browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": ip } } as never);
}

test("core user journey", async ({ browser, baseURL }, testInfo) => {
  const tag = `${Date.now()}-${testInfo.project.name}`;
  const biz = await newCtx(browser, testInfo);
  const cust = await newCtx(browser, testInfo);
  const biz2 = await newCtx(browser, testInfo);
  const anon = await newCtx(browser, testInfo);
  const bp = await biz.newPage();
  const cp = await cust.newPage();

  // 1. Business onboarding
  await createBusiness(bp, `biz-${tag}@example.test`, true);
  const venueUrl = (await bp.getByTestId("venue-url").textContent())?.trim() ?? "";
  expect(venueUrl).toMatch(/\/v\/[a-z0-9-]+$/i);
  await expect(bp.getByRole("img", { name: /QR-код заведения/ })).toBeVisible();
  const slug = venueUrl.split("/v/")[1];

  // 2. Customer gets a card and QR
  await register(cp, `cust-${tag}@example.test`, "customer");
  await cp.waitForURL(/\/me/);
  await cp.goto(`/v/${slug}`);
  await expect(cp.getByRole("heading", { name: "Точка на Тверской" })).toBeVisible();
  await cp.getByRole("button", { name: "Получить карту" }).click();
  await cp.waitForURL(/\/me/);
  await cp.goto("/me/qr");
  const token = await cp.locator("[data-token]").getAttribute("data-token");
  expect(token).toMatch(/^BG1\./);

  // 3. Staff scans: accrue, then one-time token reuse fails
  await bp.goto("/app/scan");
  await bp.fill("#scan-code", token!);
  await bp.getByRole("button", { name: "Начислить" }).click();
  await expect(bp.getByText("Начислено")).toBeVisible();
  await expect(bp.getByText("Баланс карты:")).toContainText("1");
  await expect(bp.getByText("Баланс карты:")).toContainText("из 5");
  await bp.fill("#scan-code", token!);
  await bp.getByRole("button", { name: "Начислить" }).click();
  await expect(bp.getByText("недействителен или уже использован")).toBeVisible();
  await expect(bp.getByText("Начислено")).toHaveCount(0);

  // 4. Customer sees balance
  await cp.goto("/me");
  await expect(cp.getByRole("img", { name: "Штампов: 1 из 5" })).toBeVisible();

  // Full transaction history must be accessible to the customer, not
  // silently limited to the 15 operations shown on the wallet overview.
  await cp.getByRole("link", { name: "Вся история операций" }).click();
  await expect(cp).toHaveURL(/\/me\/history$/);
  await expect(cp.getByRole("heading", { name: "Все бонусные операции" })).toBeVisible();
  await expect(cp.getByText("Начисление", { exact: true })).toBeVisible();
  await expect(cp.getByText("+1", { exact: true })).toBeVisible();
  await cp.goto("/me/history?cursor=invalid");
  await expect(cp.getByRole("alert").filter({ hasText: "Недействительная ссылка" })).toHaveCount(1);
  await cp.getByRole("link", { name: "Начать с первой страницы" }).click();
  await expect(cp.getByText("Начисление", { exact: true })).toBeVisible();

  // 5. FREE gating
  await bp.goto("/app/programs");
  await expect(bp.getByText("Достигнут лимит программ")).toBeVisible();
  await expect(bp.getByRole("link", { name: "Улучшить тариф" }).first()).toBeVisible();
  await bp.goto("/app/billing");
  await expect(bp.getByText("Сейчас: Бесплатный", { exact: false })).toBeVisible();

  // 6. Billing via mock provider (only when the server runs without manual SBP)
  const companyId = await bp.locator('input[name="companyId"]').first().inputValue();
  expect(companyId.length).toBeGreaterThan(5);
  if (!process.env.SBP_PHONE) {
    const proForm = bp.locator("form", { has: bp.locator('input[name="plan"][value="PRO"]') });
    await proForm.locator('input[name="months"][value="1"]').check({ force: true });
    await proForm.locator('button[type="submit"]').click();
    await bp.waitForURL(/\/app\/billing\?status=success/);
    await expect(bp.getByText("Сейчас: PRO", { exact: false })).toBeVisible();

    // Business owner can inspect the customer's history with real page links.
    await bp.goto("/app/customers");
    const customerLink = bp.locator('a[href^="/app/customers/"]').first();
    await expect(customerLink).toBeVisible();
    await customerLink.click();
    await expect(bp.getByText("Всего операций: 1. Страница 1 из 1.")).toBeVisible();

    // A stale/out-of-range page must offer a way back to valid history.
    const historyUrl = new URL(bp.url());
    historyUrl.searchParams.set("page", "99999");
    await bp.goto(historyUrl.toString());
    await expect(bp.getByRole("link", { name: "Последняя страница" })).toBeVisible();
    await bp.getByRole("link", { name: "Последняя страница" }).click();
    await expect(bp.getByText("Всего операций: 1. Страница 1 из 1.")).toBeVisible();
  }

  // 7. Tenant isolation
  const p2 = await biz2.newPage();
  await createBusiness(p2, `biz2-${tag}@example.test`, false);
  const status = await p2.evaluate(async (cid) => {
    const r = await fetch("/api/app/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: cid, action: "accrue", programId: "prog-x", customerToken: "BG1.xxxxxxxxxxxx", idempotencyKey: "idem-key-12345" }),
    });
    return r.status;
  }, companyId);
  expect(status).toBe(403);

  // 8. Auth guards
  const ap = await anon.newPage();
  await ap.goto("/app");
  await expect(ap).toHaveURL(/\/login/);
  const adminRes = await bp.goto("/admin");
  expect(adminRes?.status()).toBe(404);
  // Diagnostic page must not leak ledger data to ordinary businesses.
  const ledgerDenied = await bp.goto("/admin/ledger");
  expect(ledgerDenied?.status()).toBe(404);
  await ap.goto("/admin/ledger");
  await expect(ap).toHaveURL(/\/login/);
  await ap.goto("/me/history");
  await expect(ap).toHaveURL(/\/login/);

  // 9. Mobile overflow
  if (testInfo.project.name === "android") {
    await bp.goto("/app/scan");
    await expect(bp.locator("#scan-code")).toBeVisible();
    const overflow = await bp.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  void baseURL;
  await Promise.all([biz.close(), cust.close(), biz2.close(), anon.close()]);
});
