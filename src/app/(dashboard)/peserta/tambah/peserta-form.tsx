"use client";

import { useActionState, useState } from "react";
import { Camera, CameraOff, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { createPesertaAction, type CreatePesertaState } from "../actions";

export function PesertaForm() {
  const [state, action, pending] = useActionState<CreatePesertaState, FormData>(
    createPesertaAction,
    undefined,
  );
  const [kupons, setKupons] = useState<string[]>([]);
  const [scanOn, setScanOn] = useState(false);
  const [manual, setManual] = useState("");

  function addKupon(raw: string) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    setKupons((prev) => (prev.includes(v) ? prev : [...prev, v]));
  }
  function removeKupon(v: string) {
    setKupons((prev) => prev.filter((k) => k !== v));
  }

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama</Label>
          <Input id="nama" name="nama" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="no_whatsapp">No WhatsApp</Label>
          <Input id="no_whatsapp" name="no_whatsapp" inputMode="tel" placeholder="08xxxxxxxxxx" required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="alamat">Alamat</Label>
          <Input id="alamat" name="alamat" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nominal_donasi">Nominal Donasi (Rp)</Label>
          <Input id="nominal_donasi" name="nominal_donasi" inputMode="numeric" placeholder="100000" required />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Kupon</Label>
            <p className="text-xs text-muted-foreground">{kupons.length} kupon di-scan. Kelompok ditentukan otomatis dari kupon.</p>
          </div>
          <Button type="button" variant={scanOn ? "destructive" : "secondary"} size="sm" onClick={() => setScanOn((v) => !v)}>
            {scanOn ? <><CameraOff /> Tutup Scanner</> : <><Camera /> Buka Scanner QR</>}
          </Button>
        </div>
        {scanOn && <QrScanner onDetect={addKupon} active={scanOn} />}
        <div className="flex gap-2">
          <Input
            placeholder="Atau ketik manual: 2026A0001"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addKupon(manual); setManual(""); }
            }}
          />
          <Button type="button" variant="outline" onClick={() => { addKupon(manual); setManual(""); }}>
            <Plus /> Tambah
          </Button>
        </div>
        {kupons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {kupons.map((k) => (
              <Badge key={k} variant="secondary" className="gap-1.5 px-2 py-1 font-mono text-sm">
                {k}
                <button type="button" onClick={() => removeKupon(k)} className="rounded-full hover:bg-background/40" aria-label={`Hapus ${k}`}>
                  <X className="h-3 w-3" />
                </button>
                <input type="hidden" name="kupon" value={k} />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.success}</div>
      )}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan..." : "Simpan Peserta"}
      </Button>
    </form>
  );
}
