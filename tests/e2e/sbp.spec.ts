import { test, expect, type Page } from "@playwright/test";

// Runs only against a server started with SBP_PHONE set (manual SBP transfers instead of the mock provider).
test.skip(!process.env.SBP_PHONE, "SBP_PHONE not set for this run");

const PASSWORD = "Passw0rd!test";
async function register(page: Page, email: string) {
  await page.goto(`/register?role=business&country=RU`);
  await page.fill('input[name="name"]', "Owner");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.check('input[name="acceptTerms"]');
  await page.check('input[name="acceptPd"]');
  await page.locator('main form button[type="submit"]').last().click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/onboarding");
  await page.fill('input[name="name"]', "Барбершоп СБП");
  await page.locator('main form button[type="submit"]').last().click();
}

test("SBP: pay → instant grace → admin confirms", async ({ browser }, info) => {
  const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const biz = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": ip() } } as never);
  const adm = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": ip() } } as never);
  const bp = await biz.newPage();
  await register(bp, `sbp-${Date.now()}-${info.project.name}@example.test`);

  await bp.goto("/app/billing");
  await bp.locator("form").filter({ hasText: "Перейти на PRO" }).getByRole("button", { name: "Перейти на PRO" }).click();
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
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@bonusgo.test";
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
  const card = ap.locator(".card").filter({ hasText: "Барбершоп СБП" }).filter({ hasText: "PRO" }).first();
  await card.getByRole("button", { name: "Подтвердить" }).click();
  await expect(ap.getByText(/Подтверждено/).first()).toBeVisible();

  await bp.goto("/app/billing");
  await expect(bp.getByText("оплачено").first()).toBeVisible();
  await expect(bp.getByText(/Сейчас: PRO/)).toBeVisible();
});
