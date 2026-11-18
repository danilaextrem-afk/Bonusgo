import type { ReactNode } from "react";

/** Tiny safe Markdown renderer. Produces React elements only (no raw HTML), so all text is escaped by React. */

function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h) || h.startsWith("/") || h.startsWith("#")) return h;
  return null;
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${n++}`;
    if (m[1] !== undefined) out.push(<strong key={key} className="font-semibold text-text">{inline(m[1], key)}</strong>);
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      out.push(
        href ? (
          <a key={key} href={href} className="text-neon underline underline-offset-2" {...(/^https?:/i.test(href) ? { rel: "noopener noreferrer" } : {})}>
            {m[2]}
          </a>
        ) : (
          m[2]
        ),
      );
    } else if (m[4] !== undefined) out.push(<em key={key}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const OL = /^\s*\d+[.)]\s+(.*)$/;
const UL = /^\s*[-*+]\s+(.*)$/;

export function renderMarkdown(src: string): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const key = `n${k++}`;
      const content = inline(h[2].trim(), key);
      if (level === 1) nodes.push(<h2 key={key} className="mb-4 mt-2 text-2xl font-bold text-text">{content}</h2>);
      else if (level === 2) nodes.push(<h2 key={key} className="mb-3 mt-9 text-xl font-bold text-text">{content}</h2>);
      else nodes.push(<h3 key={key} className="mb-2 mt-6 text-lg font-semibold text-text">{content}</h3>);
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      nodes.push(<hr key={`n${k++}`} className="my-8 border-line" />);
      i++;
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line) && !UL.test(line);
      const re = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push((re.exec(lines[i]) as RegExpExecArray)[1]);
        i++;
      }
      const key = `n${k++}`;
      const lis = items.map((t, j) => <li key={j}>{inline(t, `${key}-${j}`)}</li>);
      nodes.push(
        ordered ? (
          <ol key={key} className="my-4 list-decimal space-y-1.5 pl-6">{lis}</ol>
        ) : (
          <ul key={key} className="my-4 list-disc space-y-1.5 pl-6">{lis}</ul>
        ),
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      const key = `n${k++}`;
      nodes.push(<blockquote key={key} className="my-4 border-l-2 border-neon/60 pl-4 text-muted">{inline(buf.join(" "), key)}</blockquote>);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>\s?|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) buf.push(lines[i++].trim());
    const key = `n${k++}`;
    nodes.push(<p key={key} className="my-3">{inline(buf.join(" "), key)}</p>);
  }
  return nodes;
}
