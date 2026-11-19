import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { InstallBanner } from "@/components/app/InstallBanner";
import { CopyButton } from "@/components/app/CopyButton";
import { StampGrid } from "@/components/app/StampGrid";
import { Empty, PageHeader, formatDate } from "@/components/app/ui";
import { asArray, pNum, pStr, pick, rec } from "@/components/app/adapt";
import { appUrl } from "@/components/app/safe";
import { requireUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { getCustomerCards } from "@/server/loyalty/service";

export const dynamic = "force-dynamic";
const TYPE: Record<string, string> = { ACCRUE: "Начисление", REDEEM: "Списание награды", ADJUST: "Корректировка", REFERRAL_BONUS: "Бонус за приглашение" };

export default async function MePage() {
  const user = await requireUser();
  const cards = asArray(await getCustomerCards(user.id), "cards");
  const cardIds = cards.map((c) => pStr(pick(c, "card") ?? c, "id")).filter(Boolean);
  const history = cardIds.length
    ? await db
        .select({ id: schema.transactions.id, type: schema.transactions.type, amount: schema.transactions.amount, createdAt: schema.transactions.createdAt, program: schema.programs.name })
        .from(schema.transactions)
        .innerJoin(schema.cards, eq(schema.cards.id, schema.transactions.cardId))
        .innerJoin(schema.programs, eq(schema.programs.id, schema.cards.programId))
        .where(inArray(schema.transactions.cardId, cardIds))
        .orderBy(desc(schema.transactions.createdAt))
        .limit(15)
    : [];
  const invite = `${appUrl()}/register?role=customer&invite=${user.inviteCode}`;

  return (
    <>
      <PageHeader title={`Привет${user.name ? `, ${user.name}` : ""}!`} subtitle="Ваши бонусные карты" actions={<Link href="/me/qr" className="btn-primary">Мой QR</Link>} />
      <InstallBanner />
      <div className="space-y-4">
        {cards.length === 0 && <Empty>Карт пока нет. Отсканируйте QR-код в заведении, чтобы получить первую.</Empty>}
        {cards.map((c, i) => {
          const card = rec(pick(c, "card") ?? c);
          const program = rec(pick(c, "program") ?? c);
          const venue = rec(pick(c, "venue"));
          const balance = pNum(card, "balance");
          const isStamps = pStr(program, "type") === "STAMPS";
          const color = /^#[0-9a-fA-F]{6}$/.test(pStr(venue, "brandColor")) ? pStr(venue, "brandColor") : "#39FF88";
          const rewards = asArray(pick(c, "rewards") ?? pick(program, "rewards")).filter((r) => pNum(r, "cost") > 0 && pNum(r, "cost") <= balance);
          const total = pNum(program, "stampsRequired");
          return (
            <div key={pStr(card, "id") || i} className="card" style={{ borderColor: `${color}55` }}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{pStr(venue, "name") || pStr(program, "name")}</div>
                  <div className="truncate text-xs text-muted">{pStr(program, "name")}</div>
                </div>
                {!isStamps && <div className="text-right"><div className="text-2xl font-bold" style={{ color }}>{balance}</div><div className="text-xs text-muted">баллов</div></div>}
              </div>
              {isStamps && total > 0 && (
                <>
                  <StampGrid total={total} filled={balance} accent={color} />
                  <p className="mt-2 text-xs text-muted">{balance >= total ? `Награда доступна: ${pStr(program, "rewardText")}` : `До награды (${pStr(program, "rewardText")}): ${total - balance}`}</p>
                </>
              )}
              {!isStamps && rewards.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {rewards.map((r, j) => <li key={pStr(r, "id") || j} className="text-neon">🎁 Доступно: {pStr(r, "title")} ({pNum(r, "cost")})</li>)}
                </ul>
              )}
            </div>
          );
        })}

        {history.length > 0 && (
          <div className="card">
            <h2 className="mb-2 font-semibold">История</h2>
            <ul className="divide-y divide-line text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2">
                  <span>{TYPE[h.type] ?? h.type}<span className="block text-xs text-muted">{h.program} · {formatDate(h.createdAt)}</span></span>
                  <b className={h.amount < 0 ? "text-warn" : "text-neon"}>{h.amount > 0 ? `+${h.amount}` : h.amount}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cards.length > 0 && (
          <div className="flex justify-end">
            <Link href="/me/history" className="btn-secondary">Вся история операций</Link>
          </div>
        )}

        <div className="card">
          <h2 className="mb-1 font-semibold">Пригласите друзей</h2>
          <p className="mb-3 text-sm text-muted">Отправьте ссылку друзьям — они тоже смогут копить бонусы.</p>
          <p className="mb-3 break-all rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-xs">{invite}</p>
          <CopyButton text={invite} label="Копировать ссылку" />
        </div>
      </div>
    </>
  );
}
