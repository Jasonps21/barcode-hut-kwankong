"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { hanziToPinyin } from "@/lib/pinyin";
import { daftarProvinsi, kotaUntukProvinsi, semuaKota } from "@/lib/wilayah";
import { updateAnggotaAction, createJenisUsahaAction, type AksiState } from "../../actions";
import { NomorUsahaEditor, emptyNomorUsahaRow, type NomorUsahaRow } from "../../nomor-usaha-editor";

export interface EditAnggota {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  alamat: string | null;
  no_whatsapp: string | null;
  kota_kabupaten: string | null;
  provinsi: string | null;
  jenis_usaha_id: string | null;
  keterangan: string | null;
}

export interface EditNomorUsaha {
  label: string | null;
  nomor: string;
  sama_dengan_wa: boolean;
}

export function EditAnggotaForm({
  anggota,
  jenisUsahaOptions = [],
  nomorUsahaAwal = [],
}: {
  anggota: EditAnggota;
  jenisUsahaOptions?: { id: string; nama: string }[];
  nomorUsahaAwal?: EditNomorUsaha[];
}) {
  const [state, action, pending] = useActionState<AksiState, FormData>(updateAnggotaAction, undefined);
  const [namaHanzi, setNamaHanzi] = useState(anggota.nama_hanzi ?? "");
  const pinyinPreview = useMemo(() => hanziToPinyin(namaHanzi), [namaHanzi]);

  const [provinsi, setProvinsi] = useState(anggota.provinsi ?? "");
  const [kotaKabupaten, setKotaKabupaten] = useState(anggota.kota_kabupaten ?? "");
  const [jenisUsahaList, setJenisUsahaList] = useState(jenisUsahaOptions);
  const [jenisUsahaId, setJenisUsahaId] = useState(anggota.jenis_usaha_id ?? "");
  const [noWhatsapp, setNoWhatsapp] = useState(anggota.no_whatsapp ?? "");
  const [nomorUsaha, setNomorUsaha] = useState<NomorUsahaRow[]>(
    nomorUsahaAwal.length
      ? nomorUsahaAwal.map((n) => ({ label: n.label ?? "", nomor: n.nomor, samaWa: n.sama_dengan_wa }))
      : [emptyNomorUsahaRow()],
  );

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

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="anggota_id" value={anggota.id} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama / Toko</Label>
          <Input id="nama" name="nama" defaultValue={anggota.nama} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="no_whatsapp">No WhatsApp</Label>
          <Input
            id="no_whatsapp"
            name="no_whatsapp"
            inputMode="tel"
            value={noWhatsapp}
            onChange={(e) => setNoWhatsapp(e.target.value)}
            placeholder="08xxxxxxxxxx (boleh kosong)"
          />
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
          <Input id="alamat" name="alamat" defaultValue={anggota.alamat ?? ""} required />
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
          <Input id="keterangan" name="keterangan" defaultValue={anggota.keterangan ?? ""} placeholder="mis. TV LG, Genset Yamaha" />
        </div>
      </div>

      <NomorUsahaEditor noWhatsapp={noWhatsapp} rows={nomorUsaha} onChange={setNomorUsaha} />

      {state?.error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>}
      {state?.success && <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.success}</div>}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan..." : "Simpan Perubahan"}
      </Button>
    </form>
  );
}
