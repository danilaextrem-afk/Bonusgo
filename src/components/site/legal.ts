import { promises as fs } from "fs";
import path from "path";
import { contactEmail, type CP } from "./site-data";

export type LegalKind = "privacy" | "terms" | "consent" | "cookies";

const PLACEHOLDER = "[указывается после регистрации]";

function fileFor(kind: LegalKind, country: CP): string[] {
  switch (kind) {
    case "privacy":
      return [`privacy-${country}.md`];
    case "terms":
      return [`terms-${country}.md`];
    case "consent":
      return [`consent-${country}.md`, "consent-ru.md"];
    case "cookies":
      return ["cookies.md"];
  }
}

function fillPlaceholders(md: string): string {
  const env: Record<string, string | undefined> = {
    OWNER_NAME: process.env.OWNER_NAME,
    OWNER_TAX_ID: process.env.OWNER_TAX_ID,
    OWNER_ADDRESS: process.env.OWNER_ADDRESS,
    OWNER_PHONE: process.env.OWNER_PHONE,
    OWNER_REG_NUMBER: process.env.OWNER_REG_NUMBER,
    OWNER_EMAIL: process.env.OWNER_EMAIL || contactEmail(),
    CONTACT_EMAIL: contactEmail(),
    PRIVACY_EMAIL: process.env.PRIVACY_EMAIL || contactEmail(),
    SITE_URL: process.env.APP_URL,
    SITE_NAME: "BONUSGO",
  };
  return md.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key: string) => env[key] || PLACEHOLDER);
}

/** Reads a legal document at build time; returns null when missing. */
export async function loadLegal(kind: LegalKind, country: CP): Promise<string | null> {
  for (const name of fileFor(kind, country)) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), "src", "content", "legal", name), "utf8");
      if (raw.trim()) return fillPlaceholders(raw.replace(/^\s*#\s+[^\n]*\n/, ""));
    } catch {
      /* try next */
    }
  }
  return null;
}
