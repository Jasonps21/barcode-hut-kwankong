"use client";

import { useActionState, useMemo, useState } from "react";
import { Camera, CameraOff, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { hanziToPinyin } from "@/lib/pinyin";
import { daftarProvinsi, kotaUntukProvinsi, semuaKota } from "@/lib/wilayah";
import { createAnggotaAction, createJenisUsahaAction, type AksiState } from "../actions";
import { NomorUsahaEditor, emptyNomorUsahaRow, type NomorUsahaRow } from "../nomor-usaha-editor";
import type { PilihanKegiatan } from "../[id]/tambah-donasi-form";

/** Tanggal hari ini dalam format yang diterima <input type="date"> (WITA). */
function hariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function AnggotaForm({
  isAdmin = false,
  bukuOptions = [],
  jenisUsahaOptions = [],
  kegiatan = null,
}: {
  isAdmin?: boolean;
  bukuOptions?: { id: string; nama: string }[];
  jenisUsahaOptions?: { id: string; nama: string }[];
  /** Kegiatan yang sedang aktif; null = setoran pertama tidak bisa diisi. */
  kegiatan?: PilihanKegiatan | null;
}) {
  const [state, action, pending] = useActionState<AksiState, FormData>(createAnggotaAction, undefined);
  const [kupons, setKupons] = useState<string[]>([]);
  const [scanOn, setScanOn] = useState(false);
  const [manual, setManual] = useState("");
  const [namaHanzi, setNamaHanzi] = useState("");
  const [metode, setMetode] = useState("");
  const pinyinPreview = useMemo(() => hanziToPinyin(namaHanzi), [namaHanzi]);

  const [provinsi, setProvinsi] = useState("");
  const [kotaKabupaten, setKotaKabupaten] = useState("");
  const [jenisUsahaList, setJenisUsahaList] = useState(jenisUsahaOptions);
  const [jenisUsahaId, setJenisUsahaId] = useState("");
  const [noWhatsapp, setNoWhatsapp] = useState("");
  const [nomorUsaha, setNomorUsaha] = useState<NomorUsahaRow[]>([emptyNomorUsahaRow()]);

  const pakaiKupon = kegiatan?.pakai_kupon ?? false;

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
          <Input
            id="no_whatsapp"
            name="no_whatsapp"
            inputMode="tel"
            placeholder="08xxxxxxxxxx"
            value={noWhatsapp}
            onChange={(e) => setNoWhatsapp(e.target.value)}
          />
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
        {isAdmin && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="buku_id">Buku Penagihan</Label>
            <Select id="buku_id" name="buku_id" required defaultValue="">
              <option value="" disabled>Pilih buku…</option>
              {bukuOptions.map((k) => (
                <option key={k.id} value={k.id}>{k.nama}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <NomorUsahaEditor noWhatsapp={noWhatsapp} rows={nomorUsaha} onChange={setNomorUsaha} />

      {kegiatan ? (
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <Label className="text-base">Setoran pertama (opsional)</Label>
          <p className="text-xs text-muted-foreground">
            Dicatat untuk kegiatan <span className="font-semibold text-foreground">{kegiatan.nama}</span>.
            Kosongkan nominal bila anggota ini baru didata dan belum menyetor.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nominal">Nominal Donasi</Label>
            <RupiahInput id="nominal" name="nominal" placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tanggal">Tanggal Setor</Label>
            <Input id="tanggal" name="tanggal" type="date" defaultValue={hariIni()} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Metode Bayar</Label>
            <div className="flex gap-2">
              {(["cash", "transfer"] as const).map((m) => (
                <label
                  key={m}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                >
                  <input type="radio" name="metode_bayar" value={m} className="sr-only" onChange={() => setMetode(m)} />
                  {m}
                </label>
              ))}
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

        {pakaiKupon && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>Kupon (boleh dikosongkan)</Label>
                <p className="text-xs text-muted-foreground">{kupons.length} kupon di-scan.</p>
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
        )}
      </div>
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Belum ada kegiatan aktif, jadi setoran belum bisa dicatat. Anggota tetap bisa disimpan.
        </p>
      )}

      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.success}</div>
      )}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan..." : "Simpan Anggota"}
      </Button>
    </form>
  );
}
