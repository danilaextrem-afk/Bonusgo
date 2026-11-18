import type { ReactNode } from "react";
import { CustomerShell } from "@/components/app/CustomerShell";
import { requireUser } from "@/server/auth/session";
import { logoutAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function MeLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <CustomerShell logoutAction={logoutAction}>{children}</CustomerShell>;
}
