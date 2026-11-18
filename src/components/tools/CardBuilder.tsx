"use client";
import Link from "next/link";
import { CardMockup } from "@/components/site/CardMockup";
import { CARD_ICONS, type IconName } from "@/components/site/icons";
import { Icon } from "@/components/site/icons";
import { registerHref, type CP } from "@/components/site/site-data";
import { useUrlState } from "./useUrlState";
import { ShareButton } from "./ui";

const COLORS = ["#39ff88", "#4cc9f0", "#ffc24b", "#ff7a9c", "#b388ff", "#ff8a3d"];
const DEFAULTS = { name: "Кофейня «Зерно»", color: "#39ff88", stamps: "8", reward: "Капучино в подарок", icon: "cup" };

export function CardBuilder({ country, shareable = true }: { country: CP; shareable?: boolean }) {
  const [s, set] = useUrlState(DEFAULTS, shareable);
  const color = /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : DEFAULTS.color;
  const stamps = Math.min(12, Math.max(5, Math.round(Number(s.stamps)) || 8));
  const icon = (CARD_ICONS.find((i) => i.key === s.icon)?.key ?? "cup") as IconName;
  const name = s.name.slice(0, 40);
  const reward = s.reward.slice(0, 60);
  const href = registerHref(country, { name, color, stamps: String(stamps), reward, icon });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card space-y-5">
        <div>
          <label className="label" htmlFor="cb-name">Название заведения</label>
          <input id="cb-name" className="input" maxLength={40} value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <fieldset>
          <legend className="label">Цвет карты</legend>
          <div className="flex flex-wrap items-center gap-2.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Цвет ${c}`}
                aria-pressed={c === color}
                onClick={() => set({ color: c })}
                className={`h-10 w-10 rounded-full border-2 transition ${c === color ? "border-text scale-110" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
            <label className="sr-only" htmlFor="cb-color">Свой цвет</label>
            <input id="cb-color" type="color" value={color} onChange={(e) => set({ color: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface-2 p-1" />
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="cb-stamps">Штампов до награды: {stamps}</label>
          <input id="cb-stamps" type="range" min={5} max={12} step={1} value={stamps} onChange={(e) => set({ stamps: e.target.value })} className="w-full accent-[#39ff88]" />
          <div className="flex justify-between text-xs text-muted" aria-hidden="true"><span>5</span><span>12</span></div>
        </div>
        <div>
          <label className="label" htmlFor="cb-reward">Награда</label>
          <input id="cb-reward" className="input" maxLength={60} value={s.reward} onChange={(e) => set({ reward: e.target.value })} />
        </div>
        <fieldset>
          <legend className="label">Значок штампа</legend>
          <div className="flex flex-wrap gap-2">
            {CARD_ICONS.map((i) => (
              <button
                key={i.key}
                type="button"
                aria-label={i.label}
                aria-pressed={i.key === icon}
                onClick={() => set({ icon: i.key })}
                className={`flex h-11 w-11 items-center justify-center rounded-xl border transition ${i.key === icon ? "border-neon text-neon" : "border-line text-muted hover:text-text"}`}
              >
                <Icon name={i.key} />
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="space-y-4">
        <div className="card">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Предпросмотр (демо)</p>
          <CardMockup name={name} accent={color} total={stamps} filled={Math.ceil(stamps / 2)} reward={reward} icon={icon} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={href} className="btn-primary">Создать такую карту бесплатно</Link>
          {shareable && <ShareButton />}
        </div>
      </div>
    </div>
  );
}
