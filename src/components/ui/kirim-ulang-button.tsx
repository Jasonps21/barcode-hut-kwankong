"use client";

import { useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { Button } from "./button";

/**
 * Tombol "Kirim Ulang" yang mengunci dirinya selama aksi server berjalan.
 *
 * Ini hanya lapis kenyamanan: penjaga sesungguhnya ada di server
 * (`klaimKirimUlang` di `@/lib/whatsapp`), yang menyetel ulang status dan
 * mengklaim baris dalam satu pembaruan bersyarat. Tombol ini sekadar mencegah
 * klik beruntun sampai ke server dan memberi tahu petugas bahwa prosesnya jalan.
 */
export function KirimUlangButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      <Send /> {pending ? "Mengirim…" : "Kirim Ulang"}
    </Button>
  );
}
