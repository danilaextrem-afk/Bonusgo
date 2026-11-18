// Contract between content authors and the site renderer.
export type ToolKey = "loyalty-calculator" | "qr-generator" | "program-cost" | "repeat-revenue" | "card-builder";
export type CountryPath = "ru" | "by";

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "example"; title: string; text: string } // worked example with real numbers
  | { type: "tool"; tool: ToolKey }
  | { type: "callout"; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

export interface SeoPage {
  slug: string; // latin, kebab-case, no leading slash
  countries: CountryPath[]; // which regional versions exist
  kind: "landing" | "article";
  industry?: "coffee" | "barber" | "beauty" | "carwash" | "cafe" | "retail" | "general";
  title: string; // <= 60 chars
  description: string; // <= 155 chars
  h1: string;
  lead: string;
  /** Region-specific overrides (prices, payment methods, legal notes). */
  regional?: Partial<Record<CountryPath, { title?: string; description?: string; h1?: string; lead?: string; extra?: Block[] }>>;
  blocks: Block[];
  faq: { q: string; a: string }[];
  related: string[]; // slugs of other pages for internal linking
  updated: string; // ISO date
}
