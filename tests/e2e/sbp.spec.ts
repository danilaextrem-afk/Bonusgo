import { test, expect, type Page } from "@playwright/test";

// Runs only against a server started with SBP_PHONE set (manual SBP transfers instead of the mock provider).
test.skip(!process.env.SBP_PHONE, "SBP_PHONE not set for this run");

const PASSWORD = "Passw0rd!test";
async function register(page: Page, email: string, company: string) {
  await page.goto(`/register?role=business&country=RU`);
  await page.fill('input[name="name"]', "Owner");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.check('input[name="acceptTerms"]');
  await page.check('input[name="acceptPd"]');
  await page.locator('main form button[type="submit"]').last().click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/onboarding");
  await page.fill('input[name="name"]', company);
  await page.locator('main form button[type="submit"]').last().click();
  await expect(page.getByText("Шаг 2 из 4")).toBeVisible(); // company exists before we leave onboarding
}

test("SBP: pay → instant grace → admin confirms", async ({ browser }, info) => {
  const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const biz = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": ip() } } as never);
  const adm = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": ip() } } as never);
  const bp = await biz.newPage();
  const company = `Барбершоп ${Date.now()}-${info.project.name}`;
  await register(bp, `sbp-${Date.now()}-${info.project.name}@example.test`, company);

  await bp.goto("/app/billing");
  await bp.locator("form").filter({ hasText: "Оплатить PRO" }).getByRole("button", { name: "Оплатить PRO" }).click();
  await bp.waitForURL(/\/app\/billing\/sbp\//);
  await expect(bp.getByText("Т-Банк")).toBeVisible();
  await expect(bp.getByText(/BG-\d+/).first()).toBeVisible();
  await bp.screenshot({ path: `test-results/sbp-${info.project.name}.png`, fullPage: true });
  await bp.getByRole("button", { name: "Я оплатил" }).click();
  await expect(bp.getByText("Тариф уже включён")).toBeVisible();
  await bp.goto("/app/billing");
  await expect(bp.getByText("на проверке")).toBeVisible();

  // Platform admin (ADMIN_EMAILS) confirms
  const ap = await adm.newPage();
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@qronus.test";
  // Ensure the admin account exists (registration fails harmlessly if it already does).
  await ap.goto("/register?role=customer");
  await ap.fill('input[name="email"]', adminEmail);
  await ap.fill('input[name="password"]', PASSWORD);
  await ap.check('input[name="acceptTerms"]');
  await ap.check('input[name="acceptPd"]');
  await ap.locator('main form button[type="submit"]').last().click();
  // Fresh account → registration logs in and redirects to /me; existing account → log in instead.
  const registered = await ap.waitForURL(/\/me/, { timeout: 5000 }).then(() => true, () => false);
  if (!registered) {
    await ap.goto("/login");
    await ap.fill('input[name="email"]', adminEmail);
    await ap.fill('input[name="password"]', PASSWORD);
    await ap.locator('main form button[type="submit"]').last().click();
    await ap.waitForURL(/\/(app|me)/);
  }
  await ap.goto("/admin");
  const pendingCard = ap.locator(".card").filter({ hasText: company }).filter({ has: ap.getByRole("button", { name: "Подтвердить" }) }).last();
  await pendingCard.getByRole("button", { name: "Подтвердить" }).click();
  // Confirmed claim leaves the pending list and shows up under "Без чека" (receipts not configured in tests).
  await expect(ap.locator(".card").filter({ hasText: company }).getByRole("button", { name: "Подтвердить" })).toHaveCount(0);
  await expect(ap.getByText(/Без чека/)).toBeVisible();

  await bp.goto("/app/billing");
  await expect(bp.getByText("оплачено").first()).toBeVisible();
  await expect(bp.getByText(/Сейчас: PRO/)).toBeVisible();
});
