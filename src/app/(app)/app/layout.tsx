import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { getAppContext } from "@/components/app/data";
import { effectivePlan } from "@/server/limits";
import { isPlatformAdmin } from "@/server/auth/session";
import { logoutAction } from "../auth-actions";
import { switchCompanyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, memberships, current } = await getAppContext();
  const plan = current ? await effectivePlan(current.company) : null;
  return (
    <AppShell
      userName={user.name || user.email}
      companies={memberships.map((m) => ({ id: m.company.id, name: m.company.name }))}
      currentId={current?.company.id ?? null}
      currentName={current?.company.name ?? null}
      role={current?.role ?? null}
      plan={plan}
      switchAction={switchCompanyAction}
      logoutAction={logoutAction}
      isAdmin={isPlatformAdmin(user)}
    >
      {children}
    </AppShell>
  );
}
