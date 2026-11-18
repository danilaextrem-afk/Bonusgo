import Link from "next/link";
import type { ReactNode } from "react";

export function PlanGate({ title, children, need = "PRO" }: { title: string; children?: ReactNode; need?: "PRO" | "TOP" }) {
  return (
    <div className="card border-neon/30 bg-neon/5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-xl">🔒</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted">
            {children ?? "Эта возможность недоступна на вашем тарифе."} Доступно с тарифа {need}.
          </p>
          <Link href="/app/billing" className="btn-primary mt-3 inline-flex">Улучшить тариф</Link>
        </div>
      </div>
    </div>
  );
}
