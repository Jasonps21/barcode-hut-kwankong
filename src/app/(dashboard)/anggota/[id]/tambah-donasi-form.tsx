"use client";

import { useActionState, useState } from "react";
import { Camera, CameraOff, Loader2, Pencil, Phone, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { tambahDonasiAction, type AksiState } from "../actions";

/** Tanggal hari ini dalam format yang diterima <input type="date"> (WITA). */
function hariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export interface PilihanKegiatan {
  id: string;
  nama: string;
  aktif: boolean;
  pakai_kupon: boolean;
}

export function TambahDonasiForm({
  anggotaId,
  kegiatan,
  noWhatsappSekarang,
}: {
  anggotaId: string;
  /** Kegiatan yang sedang aktif — satu-satunya tujuan setoran, tidak bisa dipilih. */
  kegiatan: PilihanKegiatan;
  /** Bila diisi, form menawarkan "Ubah No HP" — nomor baru ikut tersimpan ke anggota. */
  noWhatsappSekarang?: string | null;
}) {
  const [state, action, pending] = useActionState<AksiState, FormData>(tambahDonasiAction, undefined);
  const [kupons, setKupons] = useState<string[]>([]);
  const [scanOn, setScanOn] = useState(false);
  const [manual, setManual] = useState("");
  const [metode, setMetode] = useState("");
  const [ubahWa, setUbahWa] = useState(false);
  const pakaiKupon = kegiatan.pakai_kupon;

  function tambahKupon(nomor: string) {
    const bersih = nomor.trim().toUpperCase();
    if (!bersih) return;
    setKupons((prev) => (prev.includes(bersih) ? prev : [...prev, bersih]));
    setManual("");
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="anggota_id" value={anggotaId} />

      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {state.success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Dicatat untuk kegiatan </span>
          <span className="font-semibold">{kegiatan.nama}</span>
          {!pakaiKupon && <span className="text-muted-foreground"> · tanpa kupon</span>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nominal">Nominal Donasi *</Label>
          <RupiahInput id="nominal" name="nominal" required placeholder="0" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tanggal">Tanggal Setor *</Label>
          <Input id="tanggal" name="tanggal" type="date" required defaultValue={hariIni()} />
          <p className="text-xs text-muted-foreground">
            Isi tanggal sebenarnya bila setoran diterima beberapa hari lalu.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="metode_bayar">Metode Bayar *</Label>
          <Select
            id="metode_bayar"
            name="metode_bayar"
            required
            value={metode}
            onChange={(e) => setMetode(e.target.value)}
          >
            <option value="">— pilih —</option>
            <option value="cash">Cash</option>
            <option value="transfer">Transfer</option>
          </Select>
        </div>

        {metode === "transfer" && (
          <div className="space-y-1.5">
            <Label htmlFor="bukti">Bukti Transfer *</Label>
            <Input id="bukti" name="bukti" type="file" accept="image/*,application/pdf" required />
          </div>
        )}

        {noWhatsappSekarang !== undefined && (
          <div className="rounded-md border p-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <Phone className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">No WhatsApp anggota</p>
                  <p className={noWhatsappSekarang ? "font-mono text-sm font-medium" : "text-sm italic text-muted-foreground"}>
                    {noWhatsappSekarang || "Belum ada nomor"}
                  </p>
                </div>
              </div>
              {!ubahWa && (
                <Button type="button" variant="outline" size="sm" onClick={() => setUbahWa(true)}>
                  <Pencil /> {noWhatsappSekarang ? "Ubah nomor" : "Tambah nomor"}
                </Button>
              )}
            </div>

            {/* Input baru hanya ada di DOM saat dibuka; tombol Batal mencabutnya
                sehingga nomor lama tidak ikut terkirim sebagai "nomor baru". */}
            {ubahWa && (
              <div className="mt-3 space-y-1.5 border-t pt-3">
                <Label htmlFor="no_whatsapp_baru">Nomor baru</Label>
                <div className="flex gap-2">
                  <Input
                    id="no_whatsapp_baru"
                    name="no_whatsapp_baru"
                    inputMode="tel"
                    placeholder="08xxxxxxxxxx"
                    defaultValue={noWhatsappSekarang ?? ""}
                    autoFocus
                  />
                  <Button type="button" variant="ghost" onClick={() => setUbahWa(false)}>
                    <X /> Batal
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Disimpan ke data anggota saat setoran ini disimpan.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="keterangan">Keterangan</Label>
          <Input id="keterangan" name="keterangan" placeholder="mis. tambahan setelah dapat rejeki" />
        </div>
      </div>

      {pakaiKupon && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Kupon (boleh dikosongkan)</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setScanOn((v) => !v)}>
              {scanOn ? <CameraOff /> : <Camera />}
              {scanOn ? "Tutup scanner" : "Scan QR"}
            </Button>
          </div>

          {scanOn && <QrScanner onDetect={tambahKupon} active={scanOn} />}

          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ketik nomor kupon, mis. 26A0001"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  tambahKupon(manual);
                }
              }}
            />
            <Button type="button" variant="outline" onClick={() => tambahKupon(manual)}>
              <Plus /> Tambah
            </Button>
          </div>

          {kupons.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {kupons.map((k) => (
                <Badge key={k} variant="secondary" className="gap-1">
                  {k}
                  <button
                    type="button"
                    onClick={() => setKupons((prev) => prev.filter((x) => x !== k))}
                    aria-label={`Hapus kupon ${k}`}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <input type="hidden" name="kupon" value={k} />
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Menyimpan…" : `Simpan Donasi ke ${kegiatan.nama}`}
      </Button>
    </form>
  );
}
