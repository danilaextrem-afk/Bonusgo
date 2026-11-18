import { CardMockup } from "./CardMockup";
import { FakeQr } from "./FakeQr";
import styles from "./site.module.css";

/** Original stylised phone showing an animated stamp card and the one-time customer QR. */
export function Phone({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-[270px] sm:w-[300px] ${className}`}>
      <div aria-hidden="true" className={`${styles.glow} absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(57,255,136,0.22),transparent)]`} />
      <div className={styles.float}>
        <div className="rounded-[38px] border border-[#2c3236] bg-[#0e1113] p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
          <div className="rounded-[30px] bg-[#0b0d0e] px-3.5 pb-5 pt-3">
            <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-[#1d2327]" />
            <CardMockup name="Кофейня «Зерно»" total={8} filled={5} reward="10-й кофе в подарок" icon="cup" animated />
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <FakeQr seed={7} size={64} className="shrink-0 rounded-md" />
              <div className="text-xs leading-snug">
                <p className="font-semibold text-text">Ваш QR для кассира</p>
                <p className="mt-1 text-muted">Одноразовый. Бонус начислит сотрудник.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Иллюстрация. Демо-карта</p>
    </div>
  );
}
