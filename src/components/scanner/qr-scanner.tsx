"use client";

import { useEffect, useRef, useState } from "react";

const ELEMENT_ID = "qr-scanner-region";

interface Props {
  onDetect: (text: string) => void;
  active?: boolean;
}

export function QrScanner({ onDetect, active = true }: Props) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastDetectRef = useRef<{ text: string; t: number }>({ text: "", t: 0 });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        const { Html5Qrcode } = mod;
        if (cancelled) return;
        const html5 = new Html5Qrcode(ELEMENT_ID);
        scannerRef.current = html5 as unknown as { stop: () => Promise<void>; clear: () => void };

        await html5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            const now = Date.now();
            const last = lastDetectRef.current;
            if (decodedText === last.text && now - last.t < 1500) return;
            lastDetectRef.current = { text: decodedText, t: now };
            try { navigator.vibrate?.(80); } catch {}
            onDetect(decodedText.trim());
          },
          () => {},
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal membuka kamera.");
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch {} });
        scannerRef.current = null;
      }
    };
  }, [active, onDetect]);

  return (
    <div className="space-y-2">
      <div id={ELEMENT_ID} className="overflow-hidden rounded-md border border-[var(--border)] bg-black" />
      {error && <p className="text-sm text-[var(--destructive)]">Kamera: {error}</p>}
    </div>
  );
}
