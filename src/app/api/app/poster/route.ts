import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { eq } from "drizzle-orm";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { z } from "zod";
import { qrModules } from "@/components/app/qr";
import { appUrl } from "@/components/app/safe";
import { PLAN_LIMITS, type PlanId } from "@/lib/plans";
import { getCurrentUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { AppError } from "@/server/errors";
import { effectivePlan } from "@/server/limits";
import { requireMembership } from "@/server/tenancy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const query = z.object({ venueId: z.string().min(1).max(64), format: z.enum(["a4", "a5", "png"]).default("a4") });
const SIZES = { a4: [595.28, 841.89], a5: [419.53, 595.28] } as const;

function fontPath(file: string) {
  return path.join(process.cwd(), "src", "components", "app", "fonts", file);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function fail(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail(401, "UNAUTHORIZED", "Войдите в аккаунт.");
    const q = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!q.success) return fail(400, "VALIDATION", "Некорректные параметры.");
    const venue = (await db.select().from(schema.venues).where(eq(schema.venues.id, q.data.venueId)))[0];
    if (!venue) return fail(404, "NOT_FOUND", "Заведение не найдено.");
    const { company } = await requireMembership(venue.companyId, ["OWNER", "MANAGER"]);
    const plan = (await effectivePlan(company)) as PlanId;
    const limits = PLAN_LIMITS[plan];
    const url = `${appUrl()}/v/${venue.slug}`;

    if (q.data.format === "png") {
      const buf = await QRCode.toBuffer(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="bonusgo-qr-${venue.slug}.png"`, "Cache-Control": "no-store" },
      });
    }

    const [W, H] = SIZES[q.data.format];
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const [regularBytes, boldBytes] = await Promise.all([readFile(fontPath("DejaVuSans.ttf")), readFile(fontPath("DejaVuSans-Bold.ttf"))]);
    const regular = await pdf.embedFont(regularBytes, { subset: true });
    const bold = await pdf.embedFont(boldBytes, { subset: true });
    const page = pdf.addPage([W, H]);
    const m = W * 0.09;
    const hex = limits.customBranding && /^#[0-9a-fA-F]{6}$/.test(venue.brandColor) ? venue.brandColor : "#1fcf66";
    const accent = rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
    const ink = rgb(0.07, 0.08, 0.09);

    page.drawRectangle({ x: 0, y: H - H * 0.03, width: W, height: H * 0.03, color: accent });

    // venue name (shrink to fit, up to 3 lines)
    let size = W * 0.085;
    let lines = wrap(venue.name, bold, size, W - m * 2);
    while (lines.length > 2 && size > 14) {
      size -= 2;
      lines = wrap(venue.name, bold, size, W - m * 2);
    }
    let y = H - H * 0.13;
    for (const line of lines) {
      let s = size;
      while (bold.widthOfTextAtSize(line, s) > W - m * 2 && s > 8) s -= 1;
      page.drawText(line, { x: (W - bold.widthOfTextAtSize(line, s)) / 2, y, size: s, font: bold, color: ink });
      y -= size * 1.2;
    }

    const title = "Копите бонусы";
    const ts = W * 0.075;
    y -= ts * 0.6;
    page.drawText(title, { x: (W - bold.widthOfTextAtSize(title, ts)) / 2, y, size: ts, font: bold, color: accent });

    // QR code
    const qr = qrModules(url);
    const quiet = 2;
    const qrSide = Math.min(W - m * 2, H * 0.5);
    const cell = qrSide / (qr.size + quiet * 2);
    const qx = (W - qrSide) / 2;
    const qy = y - ts * 0.8 - qrSide;
    page.drawRectangle({ x: qx - 6, y: qy - 6, width: qrSide + 12, height: qrSide + 12, color: rgb(1, 1, 1), borderColor: accent, borderWidth: 3 });
    for (let row = 0; row < qr.size; row++) {
      for (let col = 0; col < qr.size; col++) {
        if (qr.dark(col, row)) {
          page.drawRectangle({ x: qx + (col + quiet) * cell, y: qy + qrSide - (row + quiet + 1) * cell, width: cell + 0.2, height: cell + 0.2, color: rgb(0, 0, 0) });
        }
      }
    }

    const hint = "Наведите камеру телефона";
    const hs = W * 0.05;
    page.drawText(hint, { x: (W - regular.widthOfTextAtSize(hint, hs)) / 2, y: qy - hs * 2, size: hs, font: regular, color: ink });

    if (!limits.removeBranding) {
      const brand = "Создано в BONUSGO";
      const bs = W * 0.026;
      page.drawText(brand, { x: (W - regular.widthOfTextAtSize(brand, bs)) / 2, y: H * 0.035, size: bs, font: regular, color: rgb(0.45, 0.48, 0.5) });
    }

    const bytes = await pdf.save();
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="bonusgo-poster-${q.data.format}-${venue.slug}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof AppError) return fail(e.status, e.code, e.message);
    console.error("[api/app/poster]", e);
    return fail(500, "INTERNAL", "Не удалось создать плакат.");
  }
}
