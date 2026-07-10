"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyPesanButton({ pesan }: { pesan: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(pesan);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Salin pesan WhatsApp ke clipboard"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-3.5"
    >
      {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
      {copied ? "Tersalin" : "Salin Pesan"}
    </button>
  );
}
