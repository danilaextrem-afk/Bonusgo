import type { QrData } from "./qr";

/** Presentational QR (safe in client and server components). */
export function QrSvg({ qr, className, label }: { qr: QrData; className?: string; label: string }) {
  const m = 2;
  const full = qr.size + m * 2;
  return (
    <svg viewBox={`${-m} ${-m} ${full} ${full}`} className={className} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect x={-m} y={-m} width={full} height={full} fill="#fff" />
      <path d={qr.d} fill="#000" />
    </svg>
  );
}
