import { test, expect } from "@playwright/test";

const PUBLIC_PAGES = ["/ru", "/by", "/ru/tarify", "/by/tarify", "/ru/faq", "/ru/instrumenty", "/ru/bonusnaya-karta-dlya-kofeyni", "/by/programma-loyalnosti-dlya-biznesa-v-belarusi"];

test.describe("technical SEO", () => {
  test("public pages: 200, single H1, canonical, description", async ({ page }) => {
    const titles = new Set<string>();
    for (const path of PUBLIC_PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("h1"), path).toHaveCount(1);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical, path).toMatch(new RegExp(`${path.replace(/\//g, "\\/")}$`));
      const desc = await page.locator('meta[name="description"]').getAttribute("content");
      expect(desc?.length ?? 0, path).toBeGreaterThan(50);
      const title = await page.title();
      expect(titles.has(title), `duplicate title ${title}`).toBe(false);
      titles.add(title);
    }
  });

  test("hreflang ru-RU / ru-BY / x-default on shared pages, none for RU-only page", async ({ page }) => {
    await page.goto("/ru/tarify");
    const langs = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => e.getAttribute("hreflang")));
    expect(langs).toEqual(expect.arrayContaining(["ru-RU", "ru-BY", "x-default"]));
    await page.goto("/ru/bonusnye-karty-dlya-malogo-biznesa");
    const ruOnly = await page.locator('link[rel="alternate"][hreflang="ru-BY"]').count();
    expect(ruOnly).toBe(0);
  });

  test("paid plan CTAs open the business registration path", async ({ page }) => {
    await page.goto("/ru/tarify");
    const pro = page.getByRole("link", { name: /Купить PRO/ });
    const top = page.getByRole("link", { name: /Купить TOP/ });
    await expect(pro).toHaveAttribute("href", /\\/register\\?[^"]*role=business/);
    await expect(top).toHaveAttribute("href", /\\/register\\?[^"]*role=business/);
    await pro.click();
    await expect(page.getByRole("heading", { name: "Регистрация" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Я бизнес" })).toHaveAttribute("aria-current", "page");
  });

  test("regional pricing differs (RUB vs BYN)", async ({ page }) => {
    await page.goto("/ru/tarify");
    await expect(page.locator("main")).toContainText("₽");
    await page.goto("/by/tarify");
    await expect(page.locator("main")).toContainText("BYN");
  });

  test("robots.txt blocks private areas and sitemap lists both regions", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const p of ["/app", "/me", "/admin", "/api"]) expect(robots).toContain(`Disallow: ${p}`);
    expect(robots).toMatch(/Sitemap: .*sitemap\.xml/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/ru/tarify");
    expect(sitemap).toContain("/by/tarify");
    expect(sitemap).not.toContain("/app");
  });

  test("unknown page returns 404", async ({ page }) => {
    const res = await page.goto("/ru/net-takoy-stranicy-123");
    expect(res?.status()).toBe(404);
  });

  test("calculator tool computes a result", async ({ page }) => {
    await page.goto("/ru/instrumenty/loyalty-calculator");
    await expect(page.locator("main")).toContainText("%");
  });
});
