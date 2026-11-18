// Generates PWA icons into public/icons. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const GREEN = "#39FF88";
const BG = "#0b0d0e";
// Logo drawn on a 512 canvas. `scale` shrinks content toward the center (for the maskable safe zone).
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${GREEN}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="246" cy="250" r="118" fill="none" stroke="${BG}" stroke-width="56"/>
    <path d="M300 300 L392 392" stroke="${BG}" stroke-width="58" stroke-linecap="round"/>
    <path d="M392 96l13 29 31 3-23 21 7 31-28-16-28 16 7-31-23-21 31-3z" fill="${BG}"/>
  </g>
</svg>`;
mkdirSync("public/icons", { recursive: true });
const out = async (name, size, opts) => sharp(Buffer.from(svg(opts))).resize(size, size).png().toFile(`public/icons/${name}`);
await out("icon-192.png", 192, { rounded: true, scale: 1 });
await out("icon-512.png", 512, { rounded: true, scale: 1 });
await out("icon-maskable-512.png", 512, { rounded: false, scale: 0.72 });
await out("apple-touch-icon.png", 180, { rounded: false, scale: 0.9 });
