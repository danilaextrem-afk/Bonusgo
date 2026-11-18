"use client";
import { useState } from "react";
import { CardMockup } from "./CardMockup";
import { FakeQr } from "./FakeQr";
import { Icon } from "./icons";
import styles from "./site.module.css";

const TOTAL = 6;
const REWARD = "Капучино в подарок";

type Msg = { tone: "ok" | "bad" | "info"; text: string };

export function DemoCard() {
  const [stamps, setStamps] = useState(2);
  const [qrSeed, setQrSeed] = useState(1);
  const [usedSeed, setUsedSeed] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>({ tone: "info", text: "Клиент показывает QR. Нажмите «Подтвердить начисление» от лица сотрудника." });
  const [pulse, setPulse] = useState(0);
  const unlocked = stamps >= TOTAL;

  const confirm = () => {
    if (unlocked) return;
    const next = stamps + 1;
    setStamps(next);
    setUsedSeed(qrSeed);
    setQrSeed((s) => s + 1);
    setPulse((p) => p + 1);
    setMsg(
      next >= TOTAL
        ? { tone: "ok", text: "Сотрудник подтвердил начисление. Собраны все штампы: награда открыта!" }
        : { tone: "ok", text: `Сотрудник подтвердил начисление: штамп ${next} из ${TOTAL}. QR клиента обновился.` },
    );
  };
  const replay = () => {
    if (usedSeed === null) {
      setMsg({ tone: "info", text: "Сначала подтвердите одно начисление, а затем попробуйте использовать старый QR." });
      return;
    }
    setMsg({ tone: "bad", text: "Отклонено: этот QR уже использован. Каждый QR клиента работает только один раз." });
  };
  const redeem = () => {
    setStamps(0);
    setUsedSeed(null);
    setQrSeed((s) => s + 1);
    setMsg({ tone: "ok", text: "Награда выдана. Карта начинается заново." });
  };
  const reset = () => {
    setStamps(2);
    setUsedSeed(null);
    setQrSeed(1);
    setMsg({ tone: "info", text: "Демо сброшено." });
  };

  const toneCls = msg.tone === "ok" ? "border-neon/40 bg-neon/10 text-neon" : msg.tone === "bad" ? "border-danger/50 bg-danger/10 text-danger" : "border-line bg-surface-2 text-muted";

  return (
    <div>
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-xs font-semibold text-warn">
        ДЕМО · данные не сохраняются и не отправляются на сервер
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="demo-client" className="card">
          <h2 id="demo-client" className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">Телефон клиента</h2>
          <div key={pulse} className={pulse > 0 ? styles.pop : ""}>
            <CardMockup
              name="Кофейня «Зерно»"
              total={TOTAL}
              filled={stamps}
              reward={REWARD}
              icon="cup"
              footer={unlocked ? `Награда открыта: ${REWARD}` : `Награда: ${REWARD}`}
            />
          </div>
          <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-surface-2 p-3">
            <FakeQr key={qrSeed} seed={qrSeed} size={92} className="shrink-0 rounded-lg" />
            <div className="text-sm">
              <p className="font-semibold text-text">Одноразовый QR клиента</p>
              <p className="mt-1 text-muted">После каждого начисления код меняется. Это иллюстрация, а не рабочий QR.</p>
            </div>
          </div>
        </section>
        <section aria-labelledby="demo-staff" className="card flex flex-col">
          <h2 id="demo-staff" className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">Экран сотрудника</h2>
          <p className="text-sm leading-relaxed text-muted">
            Начисление происходит только когда сотрудник вручную подтверждает его после сканирования QR клиента.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {unlocked ? (
              <button type="button" className="btn-primary" onClick={redeem}>
                <Icon name="gift" size={18} /> Выдать награду
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={confirm}>
                <Icon name="check" size={18} /> Подтвердить начисление
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={replay}>
              Попробовать использовать старый QR
            </button>
            <button type="button" className="min-h-10 text-left text-sm text-muted underline underline-offset-4 hover:text-neon" onClick={reset}>
              Сбросить демо
            </button>
          </div>
          <div role="status" aria-live="polite" className={`mt-5 rounded-xl border px-4 py-3 text-sm ${toneCls}`}>
            {msg.text}
          </div>
          <p className="mt-auto pt-5 text-xs text-muted">
            Штамп добавляется после подтверждения сотрудником, награда открывается, когда собраны все {TOTAL} штампов.
          </p>
        </section>
      </div>
    </div>
  );
}
