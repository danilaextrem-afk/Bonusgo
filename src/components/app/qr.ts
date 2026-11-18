import "server-only";
import QRCode from "qrcode";

export interface QrData {
  size: number;
  d: string;
}

export function qrModules(text: string): { size: number; dark: (x: number, y: number) => boolean } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  return { size, dark: (x, y) => data[y * size + x] === 1 };
}

/** SVG path (row-run encoded) for a QR code. */
export function qrData(text: string): QrData {
  const { size, dark } = qrModules(text);
  let d = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (dark(x, y)) {
        let x2 = x;
        while (x2 < size && dark(x2, y)) x2++;
        d += `M${x} ${y}h${x2 - x}v1h-${x2 - x}z`;
        x = x2;
      } else x++;
    }
  }
  return { size, d };
}
