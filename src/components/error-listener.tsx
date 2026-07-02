"use client";

import { useEffect } from "react";

function report(message: string, stack?: string, context?: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({ message, stack, url: location.href, context });
    const sent = navigator.sendBeacon?.(
      "/api/log-error",
      new Blob([payload], { type: "application/json" }),
    );
    if (!sent) {
      fetch("/api/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Logger tidak boleh ikut melempar error baru.
  }
}

/**
 * Menangkap error JS yang tidak lewat React render (event handler, timer,
 * promise yang tidak di-catch) sehingga tidak tertangkap oleh error.tsx.
 * Dipasang sekali di root layout.
 */
export function ErrorListener() {
  useEffect(() => {
    function onError(e: ErrorEvent) {
      report(e.message, e.error?.stack, { type: "window.onerror", filename: e.filename, lineno: e.lineno });
    }
    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason;
      report(
        reason instanceof Error ? reason.message : String(reason),
        reason instanceof Error ? reason.stack : undefined,
        { type: "unhandledrejection" },
      );
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
