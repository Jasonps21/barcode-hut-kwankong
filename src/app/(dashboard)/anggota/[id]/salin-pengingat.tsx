"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeWaNumber } from "@/lib/wa-template";

/**
 * Tombol untuk petugas yang sedang menagih: salin kalimat pengingat riwayat
 * sumbangan, atau langsung buka WhatsApp dengan pesan yang sudah terisi.
 */
export function SalinPengingat({ pesan, noWhatsapp }: { pesan: string; noWhatsapp: string | null }) {
  const [tersalin, setTersalin] = useState(false);
  const target = noWhatsapp ? normalizeWaNumber(noWhatsapp) : null;

  async function salin() {
    try {
      await navigator.clipboard.writeText(pesan);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      // Clipboard bisa ditolak browser (mis. bukan HTTPS). Jangan pakai alert()
      // — dialog memblokir dan pesan tetap bisa disalin manual dari layar.
      setTersalin(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={salin}>
        {tersalin ? <Check className="text-emerald-600" /> : <Copy />}
        {tersalin ? "Tersalin" : "Salin pengingat"}
      </Button>
      {target && (
        <a
          href={`https://wa.me/${target}?text=${encodeURIComponent(pesan)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center justify-center gap-2 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-4"
        >
          <MessageCircle />
          Kirim via WhatsApp
        </a>
      )}
    </div>
  );
}
