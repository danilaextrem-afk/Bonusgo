import { ImageResponse } from "next/og";

export const alt = "QRonus — digital loyalty cards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Latin text only: the default OG font has no Cyrillic glyphs.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #0b0d0e 0%, #131618 60%, #0f2a1c 100%)",
          color: "#e8ecee",
        }}
      >
        <div style={{ display: "flex", fontSize: 128, fontWeight: 800, letterSpacing: -4 }}>
          <span style={{ color: "#39ff88" }}>QR</span>onus
        </div>
        <div style={{ marginTop: 24, fontSize: 44, color: "#9aa4ab" }}>Digital stamp cards via QR for small business</div>
        <div style={{ display: "flex", marginTop: 48 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                width: 72,
                height: 72,
                marginRight: 20,
                borderRadius: 36,
                border: `4px ${i < 4 ? "solid" : "dashed"} ${i < 4 ? "#39ff88" : "#3a4147"}`,
                background: i < 4 ? "rgba(57,255,136,0.18)" : "transparent",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
