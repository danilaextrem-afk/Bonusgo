# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: seo.spec.ts >> technical SEO >> public pages: 200, single H1, canonical, description
- Location: tests/e2e/seo.spec.ts:6:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3300/ru
Call log:
  - navigating to "http://localhost:3300/ru", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This site can’t be reached" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: localhost
      - text: refused to connect.
    - generic [ref=e10]:
      - paragraph [ref=e11]: "Try:"
      - list [ref=e12]:
        - listitem [ref=e13]: Checking the connection
        - listitem [ref=e14]:
          - link "Checking the proxy and the firewall" [ref=e15] [cursor=pointer]:
            - /url: "#buttons"
    - generic [ref=e16]: ERR_CONNECTION_REFUSED
  - generic [ref=e17]:
    - button "Reload" [ref=e19] [cursor=pointer]
    - button "Details" [ref=e20] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | const PUBLIC_PAGES = ["/ru", "/by", "/ru/tarify", "/by/tarify", "/ru/faq", "/ru/instrumenty", "/ru/bonusnaya-karta-dlya-kofeyni", "/by/programma-loyalnosti-dlya-biznesa-v-belarusi"];
  4  | 
  5  | test.describe("technical SEO", () => {
  6  |   test("public pages: 200, single H1, canonical, description", async ({ page }) => {
  7  |     const titles = new Set<string>();
  8  |     for (const path of PUBLIC_PAGES) {
> 9  |       const res = await page.goto(path);
     |                              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3300/ru
  10 |       expect(res?.status(), path).toBe(200);
  11 |       await expect(page.locator("h1"), path).toHaveCount(1);
  12 |       const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  13 |       expect(canonical, path).toMatch(new RegExp(`${path.replace(/\//g, "\\/")}$`));
  14 |       const desc = await page.locator('meta[name="description"]').getAttribute("content");
  15 |       expect(desc?.length ?? 0, path).toBeGreaterThan(50);
  16 |       const title = await page.title();
  17 |       expect(titles.has(title), `duplicate title ${title}`).toBe(false);
  18 |       titles.add(title);
  19 |     }
  20 |   });
  21 | 
  22 |   test("hreflang ru-RU / ru-BY / x-default on shared pages, none for RU-only page", async ({ page }) => {
  23 |     await page.goto("/ru/tarify");
  24 |     const langs = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => e.getAttribute("hreflang")));
  25 |     expect(langs).toEqual(expect.arrayContaining(["ru-RU", "ru-BY", "x-default"]));
  26 |     await page.goto("/ru/bonusnye-karty-dlya-malogo-biznesa");
  27 |     const ruOnly = await page.locator('link[rel="alternate"][hreflang="ru-BY"]').count();
  28 |     expect(ruOnly).toBe(0);
  29 |   });
  30 | 
  31 |   test("regional pricing differs (RUB vs BYN)", async ({ page }) => {
  32 |     await page.goto("/ru/tarify");
  33 |     await expect(page.locator("main")).toContainText("₽");
  34 |     await page.goto("/by/tarify");
  35 |     await expect(page.locator("main")).toContainText("BYN");
  36 |   });
  37 | 
  38 |   test("robots.txt blocks private areas and sitemap lists both regions", async ({ request }) => {
  39 |     const robots = await (await request.get("/robots.txt")).text();
  40 |     for (const p of ["/app", "/me", "/admin", "/api"]) expect(robots).toContain(`Disallow: ${p}`);
  41 |     expect(robots).toMatch(/Sitemap: .*sitemap\.xml/);
  42 |     const sitemap = await (await request.get("/sitemap.xml")).text();
  43 |     expect(sitemap).toContain("/ru/tarify");
  44 |     expect(sitemap).toContain("/by/tarify");
  45 |     expect(sitemap).not.toContain("/app");
  46 |   });
  47 | 
  48 |   test("unknown page returns 404", async ({ page }) => {
  49 |     const res = await page.goto("/ru/net-takoy-stranicy-123");
  50 |     expect(res?.status()).toBe(404);
  51 |   });
  52 | 
  53 |   test("calculator tool computes a result", async ({ page }) => {
  54 |     await page.goto("/ru/instrumenty/loyalty-calculator");
  55 |     await expect(page.locator("main")).toContainText("%");
  56 |   });
  57 | });
  58 | 
```