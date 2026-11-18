import type { ReactNode } from "react";
import { CustomerShell } from "@/components/app/CustomerShell";
import { isPlatformAdmin, requireUser } from "@/server/auth/session";
import { logoutAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function MeLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const isAdmin = isPlatformAdmin(user);
  return <CustomerShell logoutAction={logoutAction} isAdmin={isAdmin}>{children}</CustomerShell>;
}
