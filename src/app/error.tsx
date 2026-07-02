"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
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
        context: { type: "error-boundary" },
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <div>
        <h1 className="text-xl font-semibold">Terjadi kesalahan</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Ada masalah saat memuat halaman ini. Errornya sudah otomatis tercatat di menu Log Error.
          {error.digest && (
            <>
              {" "}Kode referensi: <span className="font-mono">{error.digest}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>
          <RefreshCw /> Coba lagi
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-4"
        >
          <Home /> Ke Dashboard
        </Link>
      </div>
    </div>
  );
}
