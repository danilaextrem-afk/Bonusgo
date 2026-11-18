export function BarChart({ data, title, height = 160 }: { data: { label: string; value: number }[]; title: string; height?: number }) {
  const W = 360;
  const pad = { l: 28, r: 6, t: 8, b: 20 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const bw = (W - pad.l - pad.r) / n;
  const ih = height - pad.t - pad.b;
  const step = Math.ceil(n / 6);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={title}>
      <title>{title}</title>
      <line x1={pad.l} x2={W - pad.r} y1={height - pad.b} y2={height - pad.b} stroke="var(--color-line)" />
      <text x={pad.l - 4} y={pad.t + 8} textAnchor="end" fontSize="11" fill="var(--color-muted)">{max}</text>
      <text x={pad.l - 4} y={height - pad.b} textAnchor="end" fontSize="11" fill="var(--color-muted)">0</text>
      {data.map((d, i) => {
        const h = (d.value / max) * ih;
        const x = pad.l + i * bw + bw * 0.15;
        return (
          <g key={i}>
            <rect x={x} y={height - pad.b - h} width={bw * 0.7} height={h} rx={2} fill="var(--color-neon)" opacity={0.85}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {i % step === 0 && (
              <text x={x + bw * 0.35} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
