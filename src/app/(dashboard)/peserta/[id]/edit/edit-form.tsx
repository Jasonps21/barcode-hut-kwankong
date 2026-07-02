"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { hanziToPinyin } from "@/lib/pinyin";
import { updatePesertaAction, type UpdatePesertaState } from "../../actions";

export interface EditPeserta {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  alamat: string;
  no_whatsapp: string;
  nominal_donasi: number | string;
  metode_bayar: string | null;
}

export function EditPesertaForm({ peserta }: { peserta: EditPeserta }) {
  const [state, action, pending] = useActionState<UpdatePesertaState, FormData>(updatePesertaAction, undefined);
  const [namaHanzi, setNamaHanzi] = useState(peserta.nama_hanzi ?? "");
  const [metode, setMetode] = useState(peserta.metode_bayar ?? "");
  const pinyinPreview = useMemo(() => hanziToPinyin(namaHanzi), [namaHanzi]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="peserta_id" value={peserta.id} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama / Toko</Label>
          <Input id="nama" name="nama" defaultValue={peserta.nama} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="no_whatsapp">No WhatsApp</Label>
          <Input id="no_whatsapp" name="no_whatsapp" inputMode="tel" defaultValue={peserta.no_whatsapp} placeholder="08xxxxxxxxxx (boleh kosong)" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="nama_hanzi">Nama Hanzi (opsional)</Label>
          <Input id="nama_hanzi" name="nama_hanzi" value={namaHanzi} onChange={(e) => setNamaHanzi(e.target.value)} placeholder="陳為慶" lang="zh" />
          {namaHanzi.trim() && (
            <p className="text-xs text-muted-foreground">Pinyin (otomatis): <span className="font-medium text-foreground">{pinyinPreview || "—"}</span></p>
          )}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="alamat">Alamat</Label>
          <Input id="alamat" name="alamat" defaultValue={peserta.alamat} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nominal_donasi">Nominal Donasi</Label>
          <RupiahInput id="nominal_donasi" name="nominal_donasi" defaultValue={Number(peserta.nominal_donasi ?? 0) || ""} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label>Metode Bayar</Label>
          <div className="flex gap-2">
            {(["cash", "transfer"] as const).map((m) => (
              <label key={m} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
                <input type="radio" name="metode_bayar" value={m} defaultChecked={peserta.metode_bayar === m} className="sr-only" onChange={() => setMetode(m)} />
                {m}
              </label>
            ))}
          </div>
        </div>
        {metode === "transfer" && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bukti">Ganti Bukti Transfer (opsional)</Label>
            <Input id="bukti" name="bukti" type="file" accept="image/*,application/pdf" />
            <p className="text-xs text-muted-foreground">Kosongkan jika tidak ingin mengganti bukti yang sudah ada.</p>
          </div>
        )}
      </div>

      {state?.error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>}
      {state?.success && <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.success}</div>}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan..." : "Simpan Perubahan"}
      </Button>
    </form>
  );
}
