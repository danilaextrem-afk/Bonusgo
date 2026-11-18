import type { ReactNode } from "react";

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className = "",
  tone = "plain",
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: "plain" | "alt";
}) {
  const hid = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? hid : undefined}
      className={`py-14 sm:py-20 ${tone === "alt" ? "border-y border-line bg-surface/40" : ""} ${className}`}
    >
      <div className="container-x">
        {(eyebrow || title || intro) && (
          <header className="mb-8 max-w-2xl sm:mb-12">
            {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neon">{eyebrow}</p>}
            {title && (
              <h2 id={hid} className="text-2xl font-bold tracking-tight text-text sm:text-4xl">
                {title}
              </h2>
            )}
            {intro && <div className="mt-3 text-base leading-relaxed text-muted sm:text-lg">{intro}</div>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
