import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

export function PageHeader({ crumbs, h1, lead, children }: { crumbs: Crumb[]; h1: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <Breadcrumbs items={crumbs} />
      <header className="container-x pb-6 pt-8 sm:pb-10 sm:pt-12">
        <h1 className="max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-text sm:text-5xl">{h1}</h1>
        {lead && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{lead}</p>}
        {children}
      </header>
    </>
  );
}
