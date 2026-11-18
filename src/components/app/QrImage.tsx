import { qrData } from "./qr";
import { QrSvg } from "./QrSvg";

/** Server-rendered QR code. */
export function QrImage({ text, className = "w-full max-w-xs rounded-xl", label = "QR-код" }: { text: string; className?: string; label?: string }) {
  return <QrSvg qr={qrData(text)} className={className} label={label} />;
}
