import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
          color: "white",
          fontSize: 280,
          fontWeight: 800,
          letterSpacing: -10,
          fontFamily: "system-ui, sans-serif",
          borderRadius: 96,
        }}
      >
        SB
      </div>
    ),
    { ...size },
  );
}
