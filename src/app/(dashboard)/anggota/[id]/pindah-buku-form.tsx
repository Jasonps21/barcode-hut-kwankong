"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pindahBukuAction, type AksiState } from "../actions";

/**
 * Pindah buku untuk satu anggota. Sengaja ada penegasan bahwa riwayat lama
 * tidak ikut pindah, karena itu pertanyaan pertama yang muncul di lapangan.
 */
export function PindahBukuForm({
  anggotaId,
  anggotaNama,
  bukuSekarangId,
  kelompokList,
}: {
  anggotaId: string;
  anggotaNama: string;
  bukuSekarangId: string | null;
  kelompokList: { id: string; nama: string }[];
}) {
  const [state, action, pending] = useActionState<AksiState, FormData>(pindahBukuAction, undefined);
  const [buka, setBuka] = useState(false);

  const tujuan = kelompokList.filter((k) => k.id !== bukuSekarangId);

  if (!buka) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" onClick={() => setBuka(true)}>
          <ArrowRightLeft /> Pindah Buku
        </Button>
        {state?.success && (
          <p className="max-w-xs text-sm text-emerald-700 dark:text-emerald-400">{state.success}</p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="w-full max-w-sm space-y-3 rounded-md border p-3">
      <input type="hidden" name="anggota_id" value={anggotaId} />
      <p className="text-sm font-medium">Pindahkan {anggotaNama}</p>

      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ke_buku_id">Buku tujuan *</Label>
        <Select id="ke_buku_id" name="ke_buku_id" required defaultValue="">
          <option value="">— pilih buku —</option>
          {tujuan.map((k) => (
            <option key={k.id} value={k.id}>{k.nama}</option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="alasan">Alasan</Label>
        <Input id="alasan" name="alasan" placeholder="mis. pindah alamat, ganti penagih" />
      </div>

      <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
        Yang berpindah hanya buku penagihan ke depan. Sumbangan yang sudah tercatat tetap
        dihitung pada buku lamanya, supaya rekap setoran petugas terdahulu tidak berubah.
      </p>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
          {pending ? "Memindahkan…" : "Pindahkan"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setBuka(false)}>
          Batal
        </Button>
      </div>
    </form>
  );
}
