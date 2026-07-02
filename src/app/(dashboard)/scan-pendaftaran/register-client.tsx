"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  Camera, CameraOff, CheckCircle2, Loader2, Pencil, Plus, Save, Search, User, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QrScanner } from "@/components/scanner/qr-scanner";
import {
  registerExistingPesertaAction,
  searchPesertaAction,
  type PesertaHit,
  type RegisterState,
} from "./actions";

export function ScanPendaftaranClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PesertaHit[]>([]);
  const [searching, startSearch] = useTransition();
  const [selected, setSelected] = useState<PesertaHit | null>(null);

  const [kupons, setKupons] = useState<string[]>([]);
  const [scanOn, setScanOn] = useState(false);
  const [manual, setManual] = useState("");
  const [metode, setMetode] = useState("");
  const [tanpaKupon, setTanpaKupon] = useState(false);
  const [editHp, setEditHp] = useState(false);

  const [state, action, pending] = useActionState<RegisterState, FormData>(
    registerExistingPesertaAction,
    undefined,
  );
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(() => {
      startSearch(async () => setResults(await searchPesertaAction(query)));
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  // Setelah sukses simpan, reset semuanya
  useEffect(() => {
    if (state?.success) {
      setSelected(null);
      setKupons([]);
      setScanOn(false);
      setQuery("");
      setResults([]);
      setMetode("");
      setTanpaKupon(false);
      setEditHp(false);
    }
  }, [state?.success]);

  function addKupon(raw: string) {
    const v = raw.trim().toUpperCase();
    if (!v) return;
    setKupons((prev) => (prev.includes(v) ? prev : [...prev, v]));
  }
  function removeKupon(v: string) {
    setKupons((prev) => prev.filter((k) => k !== v));
  }
  function toggleTanpaKupon(checked: boolean) {
    setTanpaKupon(checked);
    if (checked) {
      setKupons([]);
      setScanOn(false);
      setManual("");
    }
  }

  // ---- Tahap 1: cari & pilih peserta ----
  if (!selected) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cari">Cari peserta (nama / toko / alamat / no HP / nama hanzi)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="cari"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ketik minimal 2 huruf, mis. MAHARAJA / 陳為慶 / SULAWESI"
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {state?.success && (
          <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> {state.success}
          </div>
        )}

        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Mencari...
          </div>
        )}

        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-muted-foreground">Tidak ada peserta cocok dengan &quot;{query}&quot;.</p>
        )}

        <div className="divide-y rounded-lg border">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setSelected(p); setKupons([]); setTanpaKupon(false); setEditHp(false); }}
              className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent"
            >
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.nama}</span>
                  {p.nama_hanzi && <span lang="zh" className="text-sm text-muted-foreground">{p.nama_hanzi}</span>}
                  <Badge variant="outline" className="text-[10px]">{p.kelompok_nama ?? "-"}</Badge>
                  {p.kupon_count > 0 && (
                    <Badge variant="success" className="text-[10px]">sudah {p.kupon_count} kupon</Badge>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.alamat}{p.no_whatsapp ? ` · ${p.no_whatsapp}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Tahap 2: isi nominal + metode bayar + scan kupon ----
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="peserta_id" value={selected.id} />

      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{selected.nama}</span>
            {selected.nama_hanzi && <span lang="zh" className="text-muted-foreground">{selected.nama_hanzi}</span>}
            {selected.pinyin && <span className="text-xs italic text-muted-foreground">{selected.pinyin}</span>}
          </div>
          <p className="text-sm text-muted-foreground">{selected.alamat}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{selected.no_whatsapp || "(tanpa no HP)"} · Kelompok {selected.kelompok_nama ?? "-"}</span>
            {!editHp && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditHp(true)}>
                <Pencil className="h-3 w-3" /> Ubah No HP
              </Button>
            )}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setSelected(null); setKupons([]); setTanpaKupon(false); setEditHp(false); }}>
          <X /> Ganti
        </Button>
      </div>

      {!editHp && <input type="hidden" name="no_whatsapp" value={selected.no_whatsapp ?? ""} />}

      <div className="grid gap-4 md:grid-cols-2">
        {editHp && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="no_whatsapp">No WhatsApp baru</Label>
            <div className="flex gap-2">
              <Input
                key={selected.id}
                id="no_whatsapp"
                name="no_whatsapp"
                inputMode="tel"
                placeholder="08xxxxxxxxxx"
                defaultValue={selected.no_whatsapp ?? ""}
                required
                autoFocus
              />
              <Button type="button" variant="outline" onClick={() => setEditHp(false)}>Batal</Button>
            </div>
            <p className="text-xs text-muted-foreground">Nomor ini dipakai untuk kirim tanda terima saat Simpan.</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="nominal_donasi">Nominal Donasi</Label>
          <RupiahInput id="nominal_donasi" name="nominal_donasi" placeholder="0" required />
        </div>
        <div className="space-y-2">
          <Label>Metode Bayar</Label>
          <div className="flex gap-2">
            <PayRadio name="metode_bayar" value="cash" label="Cash" onSelect={() => setMetode("cash")} />
            <PayRadio name="metode_bayar" value="transfer" label="Transfer" onSelect={() => setMetode("transfer")} />
          </div>
        </div>
        {metode === "transfer" && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bukti">Bukti Transfer (wajib)</Label>
            <Input id="bukti" name="bukti" type="file" accept="image/*,application/pdf" required />
            <p className="text-xs text-muted-foreground">Wajib foto/scan bukti transfer (JPG/PNG/PDF, maks 8MB).</p>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Kupon</Label>
            <p className="text-xs text-muted-foreground">
              {tanpaKupon ? "Peserta tidak mengambil kupon." : `${kupons.length} kupon di-scan.`}
            </p>
          </div>
          {!tanpaKupon && (
            <Button type="button" variant={scanOn ? "destructive" : "secondary"} size="sm" onClick={() => setScanOn((v) => !v)}>
              {scanOn ? <><CameraOff /> Tutup Scanner</> : <><Camera /> Buka Scanner QR</>}
            </Button>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <input
            type="checkbox"
            name="tanpa_kupon"
            checked={tanpaKupon}
            onChange={(e) => toggleTanpaKupon(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Tidak mengambil kupon</span>
            <span className="block text-xs text-muted-foreground">
              Centang bila peserta tidak mengambil kupon sama sekali. Simpan tanpa scan kupon.
            </span>
          </span>
        </label>

        {!tanpaKupon && (
          <>
            {scanOn && <QrScanner active={scanOn} onDetect={addKupon} />}
            <div className="flex gap-2">
              <Input
                placeholder="Atau ketik manual: 2026A0001"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKupon(manual); setManual(""); } }}
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
          </>
        )}
      </div>

      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan..." : tanpaKupon ? "Simpan (Tanpa Kupon)" : "Simpan & Assign Kupon"}
      </Button>
    </form>
  );
}

function PayRadio({ name, value, label, onSelect }: { name: string; value: string; label: string; onSelect: () => void }) {
  return (
    <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
      <input type="radio" name={name} value={value} required className="sr-only" onChange={onSelect} />
      {label}
    </label>
  );
}
