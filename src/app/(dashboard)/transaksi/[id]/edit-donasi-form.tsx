"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { updateDonasiAction, type DonasiState } from "../actions";

export interface EditDonasi {
  id: string;
  nominal: number;
  metode_bayar: string;
  /** YYYY-MM-DD (WITA), untuk <input type="date">. */
  tanggal: string;
  keterangan: string | null;
  punyaBukti: boolean;
}

export function EditDonasiForm({ donasi }: { donasi: EditDonasi }) {
  const [state, action, pending] = useActionState<DonasiState, FormData>(updateDonasiAction, undefined);
  const [metode, setMetode] = useState(donasi.metode_bayar);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="donasi_id" value={donasi.id} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nominal">Nominal Donasi</Label>
          <RupiahInput id="nominal" name="nominal" defaultValue={donasi.nominal || ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tanggal">Tanggal Setor</Label>
          <Input id="tanggal" name="tanggal" type="date" defaultValue={donasi.tanggal} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Metode Bayar</Label>
          <div className="flex gap-2">
            {(["cash", "transfer"] as const).map((m) => (
              <label
                key={m}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
              >
                <input
                  type="radio"
                  name="metode_bayar"
                  value={m}
                  defaultChecked={donasi.metode_bayar === m}
                  className="sr-only"
                  onChange={() => setMetode(m)}
                />
                {m}
              </label>
            ))}
          </div>
        </div>
        {metode === "transfer" && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bukti">{donasi.punyaBukti ? "Ganti Bukti Transfer (opsional)" : "Bukti Transfer"}</Label>
            <Input id="bukti" name="bukti" type="file" accept="image/*,application/pdf" />
            {donasi.punyaBukti && (
              <p className="text-xs text-muted-foreground">Kosongkan jika tidak ingin mengganti bukti yang sudah ada.</p>
            )}
          </div>
        )}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="keterangan">Keterangan</Label>
          <Input id="keterangan" name="keterangan" defaultValue={donasi.keterangan ?? ""} />
        </div>
      </div>

      {state?.error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>}
      {state?.success && <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.success}</div>}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan..." : "Simpan Perubahan"}
      </Button>
    </form>
  );
}
