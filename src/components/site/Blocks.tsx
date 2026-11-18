import type { Block } from "@/content/types";
import { ToolEmbed } from "./ToolEmbed";
import type { CP } from "./site-data";
import { Icon } from "./icons";

export function Blocks({ blocks, country }: { blocks: Block[]; country: CP }) {
  return (
    <div className="space-y-5 text-base leading-relaxed text-[#cfd6da]">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "p":
            return <p key={i}>{b.text}</p>;
          case "h2":
            return <h2 key={i} className="!mt-10 text-2xl font-bold tracking-tight text-text sm:text-3xl">{b.text}</h2>;
          case "h3":
            return <h3 key={i} className="!mt-7 text-xl font-semibold text-text">{b.text}</h3>;
          case "ul":
            return (
              <ul key={i} className="space-y-2">
                {b.items.map((t, j) => (
                  <li key={j} className="flex gap-3"><Icon name="check" size={18} className="mt-1 shrink-0 text-neon" /><span>{t}</span></li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="space-y-2">
                {b.items.map((t, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neon/50 text-xs font-bold text-neon">{j + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            );
          case "example":
            return (
              <aside key={i} className="rounded-[18px] border border-line border-l-[3px] border-l-neon bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-neon">Пример</p>
                <p className="mt-1 font-semibold text-text">{b.title}</p>
                <p className="mt-2 text-[15px] text-muted">{b.text}</p>
              </aside>
            );
          case "callout":
            return (
              <aside key={i} role="note" className="rounded-[18px] border border-neon/30 bg-neon/5 p-5 text-text">{b.text}</aside>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-[18px] border border-line">
                <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2">
                      {b.head.map((h, j) => <th key={j} scope="col" className="px-4 py-3 font-semibold text-text">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-line last:border-0">
                        {r.map((c, k) => <td key={k} className="px-4 py-3 text-muted">{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "tool":
            return <div key={i} className="not-prose !my-8"><ToolEmbed tool={b.tool} country={country} /></div>;
          default:
            return null;
        }
      })}
    </div>
  );
}
