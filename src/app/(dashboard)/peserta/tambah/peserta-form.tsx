"use client";

import { useActionState, useMemo, useState } from "react";
import { Camera, CameraOff, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { hanziToPinyin } from "@/lib/pinyin";
import { daftarProvinsi, kotaUntukProvinsi, semuaKota } from "@/lib/wilayah";
import { createPesertaAction, createJenisUsahaAction, type CreatePesertaState } from "../actions";

export function PesertaForm({
  isAdmin = false,
  kelompokOptions = [],
  jenisUsahaOptions = [],
}: {
  isAdmin?: boolean;
  kelompokOptions?: { id: string; nama: string }[];
  jenisUsahaOptions?: { id: string; nama: string }[];
}) {
  const [state, action, pending] = useActionState<CreatePesertaState, FormData>(
    createPesertaAction,
    undefined,
  );
  const [kupons, setKupons] = useState<string[]>([]);
  const [scanOn, setScanOn] = useState(false);
  const [manual, setManual] = useState("");
  const [namaHanzi, setNamaHanzi] = useState("");
  const [metode, setMetode] = useState("");
  const [tanpaKupon, setTanpaKupon] = useState(false);
  const pinyinPreview = useMemo(() => hanziToPinyin(namaHanzi), [namaHanzi]);

  const [provinsi, setProvinsi] = useState("");
  const [kotaKabupaten, setKotaKabupaten] = useState("");
  const [jenisUsahaList, setJenisUsahaList] = useState(jenisUsahaOptions);
  const [jenisUsahaId, setJenisUsahaId] = useState("");

  const kotaOptions = useMemo(
    () => (provinsi ? kotaUntukProvinsi(provinsi) : semuaKota()),
    [provinsi],
  );

  async function handleCreateJenisUsaha(nama: string) {
    const result = await createJenisUsahaAction(nama);
    if ("error" in result) return;
    setJenisUsahaList((prev) => (prev.some((j) => j.id === result.id) ? prev : [...prev, result].sort((a, b) => a.nama.localeCompare(b.nama))));
    setJenisUsahaId(result.id);
  }

  function toggleTanpaKupon(checked: boolean) {
    setTanpaKupon(checked);
    if (checked) {
      setKupons([]);
      setScanOn(false);
      setManual("");
    }
  }

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
          <Label htmlFor="nama_hanzi">Nama Hanzi (opsional)</Label>
          <Input
            id="nama_hanzi"
            name="nama_hanzi"
            value={namaHanzi}
            onChange={(e) => setNamaHanzi(e.target.value)}
            placeholder="陳為慶"
            lang="zh"
          />
          <input type="hidden" name="pinyin" value={pinyinPreview} />
          {namaHanzi.trim() && (
            <p className="text-xs text-muted-foreground">
              Pinyin (otomatis):{" "}
              <span className="font-medium text-foreground">{pinyinPreview || "—"}</span>
            </p>
          )}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="alamat">Alamat</Label>
          <Input id="alamat" name="alamat" required />
        </div>
        <div className="space-y-2">
          <Label>Provinsi</Label>
          <Combobox
            name="provinsi"
            options={daftarProvinsi.map((p) => ({ value: p, label: p }))}
            value={provinsi}
            onChange={(v) => {
              setProvinsi(v);
              setKotaKabupaten("");
            }}
            placeholder="Pilih provinsi…"
            searchPlaceholder="Cari provinsi…"
            emptyText="Provinsi tidak ditemukan."
          />
        </div>
        <div className="space-y-2">
          <Label>Kota / Kabupaten</Label>
          <Combobox
            name="kota_kabupaten"
            options={kotaOptions.map((k) => ({ value: k, label: k }))}
            value={kotaKabupaten}
            onChange={setKotaKabupaten}
            placeholder="Pilih kota/kabupaten…"
            searchPlaceholder="Cari kota/kabupaten…"
            emptyText="Kota/kabupaten tidak ditemukan."
          />
        </div>
        <div className="space-y-2">
          <Label>Jenis Usaha</Label>
          <Combobox
            name="jenis_usaha_id"
            options={jenisUsahaList.map((j) => ({ value: j.id, label: j.nama }))}
            value={jenisUsahaId}
            onChange={setJenisUsahaId}
            placeholder="Pilih jenis usaha…"
            searchPlaceholder="Cari atau tambah jenis usaha…"
            emptyText="Belum ada kategori, ketik untuk menambah."
            onCreate={handleCreateJenisUsaha}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="keterangan">Keterangan (merk/tipe barang)</Label>
          <Input id="keterangan" name="keterangan" placeholder="mis. TV LG, Genset Yamaha" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nominal_donasi">Nominal Donasi</Label>
          <RupiahInput id="nominal_donasi" name="nominal_donasi" placeholder="0" required />
        </div>
        <div className="space-y-2">
          <Label>Metode Bayar</Label>
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
              <input type="radio" name="metode_bayar" value="cash" required className="sr-only" onChange={() => setMetode("cash")} /> Cash
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
              <input type="radio" name="metode_bayar" value="transfer" required className="sr-only" onChange={() => setMetode("transfer")} /> Transfer
            </label>
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
              {tanpaKupon
                ? "Peserta tidak mengambil kupon."
                : `${kupons.length} kupon di-scan. Kelompok ditentukan otomatis dari kupon.`}
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

        {tanpaKupon ? (
          isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="kelompok_id">Kelompok</Label>
              <select
                id="kelompok_id"
                name="kelompok_id"
                required
                defaultValue=""
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>Pilih kelompok…</option>
                {kelompokOptions.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Tanpa kupon, kelompok tidak bisa ditentukan otomatis — pilih manual.</p>
            </div>
          )
        ) : (
          <>
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
          </>
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
