export function StampGrid({ total, filled, accent = "#39FF88" }: { total: number; filled: number; accent?: string }) {
  const count = Math.max(1, Math.min(total, 40));
  const done = Math.max(0, Math.min(filled, count));
  const color = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#39FF88";
  return (
    <div className="grid grid-cols-5 gap-2" role="img" aria-label={`Штампов: ${done} из ${total}`}>
      {Array.from({ length: count }, (_, i) => {
        const on = i < done;
        return (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-full border text-sm font-bold"
            style={on ? { background: color, borderColor: color, color: "#000" } : { borderColor: "var(--color-line)", color: "var(--color-muted)" }}
          >
            {on ? "✓" : i + 1}
          </div>
        );
      })}
    </div>
  );
}
