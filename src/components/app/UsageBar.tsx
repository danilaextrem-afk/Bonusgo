export function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unavailable = limit <= 0;
  const pct = unavailable ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn" : "bg-neon";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">{unavailable ? "недоступно на тарифе" : `${used} из ${limit}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={unavailable ? 0 : limit} aria-valuenow={used} aria-label={label}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
