import Link from "next/link";
import type { ActionState } from "./action-types";

export function FormError({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <div role="alert" className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
        <p>{state.error}</p>
        {state.upsell && (
          <Link href="/app/billing" className="mt-2 inline-block font-semibold text-neon underline underline-offset-4">
            Посмотреть тарифы
          </Link>
        )}
      </div>
    );
  }
  if (state.ok) {
    return (
      <div role="status" className="mt-3 rounded-xl border border-neon/40 bg-neon/10 px-4 py-3 text-sm text-neon">
        {state.ok}
      </div>
    );
  }
  return null;
}
