"use client";

import { useMemo, useState } from "react";
import { RefreshCw, ShieldOff, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  antreUlangTerpilihAction,
  kecualikanTerpilihAction,
  batalKecualikanTerpilihAction,
} from "./actions";

export interface KandidatRow {
  id: string;
  nama: string;
  no_whatsapp: string;
  kelompok: string;
  wa_status: string;
  wa_dikecualikan: boolean;
  wa_alasan_kecuali: string | null;
  /** Dihitung di server dengan `normalizeWaNumber` agar aturannya cuma satu. */
  nomor_valid: boolean;
}

function statusBadge(status: string) {
  switch (status) {
    case "sent": return <Badge variant="success">Terkirim</Badge>;
    case "failed": return <Badge variant="destructive">Gagal</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    default: return <Badge variant="outline">Belum dikirim</Badge>;
  }
}

/**
 * Tabel peserta ber-centang untuk halaman Log WhatsApp.
 *
 * Satu formulir, tiga tombol submit. Kotak centang yang sama dipakai untuk
 * mengantre, mengecualikan, atau membatalkan pengecualian — admin memilih
 * dulu, memutuskan belakangan. Semua penjaga tetap diulang di server; yang di
 * sini hanya supaya salah pilih terlihat sebelum tombol ditekan.
 */
export function PilihAntre({ rows, batas }: { rows: KandidatRow[]; batas: number }) {
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());

  // Baris yang mustahil dikirim tidak boleh ikut terhitung sebagai "akan
  // diantre", supaya angka di tombol jujur.
  const bisaDiantre = useMemo(
    () =>
      new Set(
        rows
          .filter((r) => !r.wa_dikecualikan && r.nomor_valid && r.wa_status !== "sent")
          .map((r) => r.id),
      ),
    [rows],
  );

  const jumlahAntre = useMemo(
    () => [...dipilih].filter((id) => bisaDiantre.has(id)).length,
    [dipilih, bisaDiantre],
  );

  function toggle(id: string) {
    setDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const semuaTerlihatTerpilih = rows.length > 0 && rows.every((r) => dipilih.has(r.id));

  function toggleSemua() {
    setDipilih(semuaTerlihatTerpilih ? new Set() : new Set(rows.map((r) => r.id)));
  }

  const adaPilihan = dipilih.size > 0;
  const lebihDariKuota = jumlahAntre > batas;

  return (
    <form className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">
          {dipilih.size} dipilih
          {dipilih.size > 0 && jumlahAntre !== dipilih.size && (
            <span className="font-normal text-muted-foreground">
              {" "}
              ({jumlahAntre} layak diantre, {dipilih.size - jumlahAntre} dilewati)
            </span>
          )}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <ConfirmButton
            type="submit"
            formAction={antreUlangTerpilihAction}
            size="sm"
            variant="outline"
            disabled={jumlahAntre === 0}
            message={
              `Antrekan ${jumlahAntre} setoran terpilih?\n\n` +
              "Setiap pesan yang benar-benar terkirim dikenai biaya. " +
              `Cron mengirimnya bertahap, maksimal ${batas} per 24 jam.\n\n` +
              "Peserta yang sudah terkirim, dikecualikan, atau bernomor tidak valid " +
              "otomatis dilewati.\n\nLanjutkan?"
            }
          >
            <RefreshCw /> Antrekan terpilih
          </ConfirmButton>
          <ConfirmButton
            type="submit"
            formAction={kecualikanTerpilihAction}
            size="sm"
            variant="outline"
            disabled={!adaPilihan}
            message={
              `Tandai pemilik ${dipilih.size} setoran terpilih sebagai "jangan kirim"?\n\n` +
              "Mereka tidak akan pernah diambil cron sampai tandanya dilepas."
            }
          >
            <ShieldOff /> Kecualikan
          </ConfirmButton>
          <ConfirmButton
            type="submit"
            formAction={batalKecualikanTerpilihAction}
            size="sm"
            variant="ghost"
            disabled={!adaPilihan}
            message={
              `Lepas tanda "jangan kirim" dari pemilik ${dipilih.size} setoran terpilih?\n\n` +
              "Mereka belum otomatis diantre — pilih lagi lalu tekan \"Antrekan terpilih\" " +
              "bila memang mau dikirim."
            }
          >
            <ShieldCheck /> Batalkan pengecualian
          </ConfirmButton>
        </div>
      </div>

      {lebihDariKuota && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {jumlahAntre} setoran melebihi jatah {batas} pesan per 24 jam. Sisanya tetap menunggu di
          antrean dan dikirim otomatis pada putaran berikutnya — tidak ada yang hilang.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Pilih semua yang terlihat"
                  checked={semuaTerlihatTerpilih}
                  onChange={toggleSemua}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
              </TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>No. WhatsApp</TableHead>
              <TableHead>Kelompok</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Keterangan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Tidak ada setoran yang cocok dengan filter.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const terpilih = dipilih.has(r.id);
              const layak = bisaDiantre.has(r.id);
              return (
                <TableRow key={r.id} className={terpilih ? "bg-accent/50" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      name="ids"
                      value={r.id}
                      checked={terpilih}
                      onChange={() => toggle(r.id)}
                      aria-label={`Pilih ${r.nama}`}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.nama}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.no_whatsapp?.trim() || <span className="text-muted-foreground">(kosong)</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.kelompok}</TableCell>
                  <TableCell>{statusBadge(r.wa_status)}</TableCell>
                  <TableCell className="text-xs">
                    {r.wa_dikecualikan ? (
                      <span className="text-muted-foreground">
                        <Badge variant="outline">Dikecualikan</Badge> {r.wa_alasan_kecuali ?? ""}
                      </span>
                    ) : !r.nomor_valid ? (
                      <span className="text-red-600 dark:text-red-400">Nomor tidak valid</span>
                    ) : layak ? (
                      <span className="text-muted-foreground">Siap diantre</span>
                    ) : (
                      <span className="text-muted-foreground">Sudah terkirim</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </form>
  );
}
