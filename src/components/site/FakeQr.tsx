/** Decorative, deterministic pseudo-QR. NOT a scannable code (illustration only). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function FakeQr({ seed = 1, size = 96, className }: { seed?: number; size?: number; className?: string }) {
  const n = 21;
  const r = rng(seed * 7919 + 13);
  const cells: [number, number][] = [];
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && r() > 0.52) cells.push([x, y]);
  const finder = (ox: number, oy: number) => (
    <g key={`${ox}-${oy}`}>
      <rect x={ox} y={oy} width={7} height={7} fill="#0b0d0e" />
      <rect x={ox + 1} y={oy + 1} width={5} height={5} fill="#fff" />
      <rect x={ox + 2} y={oy + 2} width={3} height={3} fill="#0b0d0e" />
    </g>
  );
  return (
    <svg
      role="img"
      aria-label="Иллюстрация QR-кода (не рабочий код)"
      width={size}
      height={size}
      viewBox={`-1 -1 ${n + 2} ${n + 2}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x={-1} y={-1} width={n + 2} height={n + 2} fill="#fff" rx={1} />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0b0d0e" />
      ))}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
}
