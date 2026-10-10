"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buatKegiatanAction, type KegiatanState } from "./actions";

export function KegiatanForm() {
  const [state, action, pending] = useActionState<KegiatanState, FormData>(buatKegiatanAction, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {state.success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nama">Nama Kegiatan *</Label>
          <Input id="nama" name="nama" required placeholder="mis. Bakti Sosial Imlek 2027" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tahun">Tahun</Label>
          <Input id="tahun" name="tahun" inputMode="numeric" placeholder="2027" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tanggal_mulai">Tanggal Mulai</Label>
          <Input id="tanggal_mulai" name="tanggal_mulai" type="date" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="keterangan">Keterangan</Label>
          <Input id="keterangan" name="keterangan" placeholder="Catatan bebas" />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="pakai_kupon" defaultChecked className="mt-0.5 h-4 w-4" />
          <span>
            Pakai kupon
            <span className="block text-xs text-muted-foreground">
              Matikan untuk kegiatan yang hanya mencatat sumbangan, mis. kegiatan yang sudah lewat.
            </span>
          </span>
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        {pending ? "Menyimpan…" : "Buat Kegiatan"}
      </Button>
    </form>
  );
}
