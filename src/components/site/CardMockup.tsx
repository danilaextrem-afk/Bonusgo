import type { CSSProperties } from "react";
import { Icon, type IconName } from "./icons";
import styles from "./site.module.css";

export interface CardMockupProps {
  name: string;
  accent?: string;
  total?: number;
  filled?: number;
  reward?: string;
  icon?: IconName;
  /** Loops a "stamps filling" animation (static `filled` shown when motion is reduced). */
  animated?: boolean;
  /** Replaces the footer line, e.g. "Награда доступна!" */
  footer?: string;
  className?: string;
}

export function CardMockup({
  name,
  accent = "#39ff88",
  total = 8,
  filled = 5,
  reward = "Подарок за визиты",
  icon = "cup",
  animated = false,
  footer,
  className = "",
}: CardMockupProps) {
  const cols = Math.ceil(total / 2);
  const style = { "--accent": accent, } as CSSProperties;
  return (
    <div className={`${styles.card} ${className}`} style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa4ab]">Бонусная карта</p>
          <p className="mt-0.5 truncate text-lg font-bold text-[#f2f5f6]">{name || "Название заведения"}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold" style={{ color: accent }}>
          {Math.min(filled, total)}/{total}
        </span>
      </div>
      <div className={`${styles.grid} mt-4`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="img" aria-label={`Штампов собрано: ${Math.min(filled, total)} из ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`${styles.stamp} ${i < filled ? styles.filled : ""} ${animated ? styles.anim : ""}`}
            style={{ "--i": i } as CSSProperties}
          >
            <Icon name={icon} size={18} />
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-[#9aa4ab]">
        <Icon name="gift" size={15} className="shrink-0" />
        <span className="truncate">{footer ?? `Награда: ${reward}`}</span>
      </p>
    </div>
  );
}
