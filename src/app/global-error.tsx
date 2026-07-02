"use client";

import { useEffect } from "react";

/**
 * Menangkap error yang terjadi di root layout itu sendiri (jarang terjadi,
 * tapi kalau terjadi harus render <html>/<body> sendiri karena root layout
 * ikut dilewati). Style inline karena globals.css belum tentu ikut termuat.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: window.location.href,
        context: { type: "global-error-boundary" },
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Aplikasi mengalami kesalahan fatal</h1>
        <p style={{ maxWidth: 420, fontSize: 14, color: "#a1a1aa", margin: 0 }}>
          Silakan muat ulang halaman. Errornya sudah otomatis tercatat di menu Log Error.
          {error.digest && <> Kode referensi: {error.digest}</>}
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            background: "#fafafa",
            color: "#0a0a0a",
            border: "none",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Coba lagi
        </button>
      </body>
    </html>
  );
}
