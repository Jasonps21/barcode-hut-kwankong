"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { History, Loader2, Search, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatRupiah, formatTanggalWITA } from "@/lib/utils";
import { TambahDonasiForm, type PilihanKegiatan } from "../anggota/[id]/tambah-donasi-form";
import { searchAnggotaAction, type AnggotaHit } from "./actions";

/**
 * Layar petugas saat menagih: cari anggota, lihat setoran terakhirnya, lalu
 * catat setoran baru di tempat yang sama. Tidak ada lagi kunci "sudah donasi":
 * anggota boleh menyetor berkali-kali, dan setoran sebelumnya ditampilkan
 * supaya petugas tahu ini setoran tambahan.
 */
export function ScanPendaftaranClient({
  kegiatan,
  kegiatanAwalId,
}: {
  kegiatan: PilihanKegiatan[];
  kegiatanAwalId: string;
}) {
  const [query, setQuery] = useState("");
  const [hasil, setResults] = useState<AnggotaHit[]>([]);
  const [searching, startSearch] = useTransition();
  const [selected, setSelected] = useState<AnggotaHit | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hasil lama disembunyikan saat kata kunci terlalu pendek, alih-alih
  // dikosongkan lewat setState di dalam effect.
  const results = query.trim().length >= 2 ? hasil : [];

  // Debounced search
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) return;
    debounce.current = setTimeout(() => {
      startSearch(async () => setResults(await searchAnggotaAction(query, kegiatanAwalId || null)));
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, kegiatanAwalId]);

  // ---- Tahap 1: cari & pilih anggota ----
  if (!selected) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cari">Cari anggota (nama / toko / alamat / no HP / nama hanzi)</Label>
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

        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Mencari...
          </div>
        )}

        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Tidak ada anggota cocok dengan &quot;{query}&quot;.{" "}
            <Link href="/anggota/tambah" className="underline">Daftarkan anggota baru</Link>
          </p>
        )}

        {results.length > 0 && (
          <div className="divide-y rounded-lg border">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent"
              >
                <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.nama}</span>
                    {p.nama_hanzi && <span lang="zh" className="text-sm text-muted-foreground">{p.nama_hanzi}</span>}
                    <Badge variant="outline" className="text-[10px]">{p.buku_nama ?? "-"}</Badge>
                    {p.setoranKegiatanIni > 0 && (
                      <Badge variant="success" className="text-[10px]">sudah {p.setoranKegiatanIni}x setor di kegiatan ini</Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.alamat ?? "-"}{p.no_whatsapp ? ` · ${p.no_whatsapp}` : ""}
                  </div>
                  <div className="mt-0.5 text-xs">
                    {p.terakhir ? (
                      <span className="text-muted-foreground">
                        Terakhir: <span className="font-medium text-foreground">{formatRupiah(p.terakhir.nominal)}</span>
                        {" "}· {p.terakhir.kegiatan} · {formatTanggalWITA(p.terakhir.tanggal, { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Belum pernah menyetor</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Tahap 2: catat setoran ----
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{selected.nama}</span>
            {selected.nama_hanzi && <span lang="zh" className="text-muted-foreground">{selected.nama_hanzi}</span>}
            {selected.pinyin && <span className="text-xs italic text-muted-foreground">{selected.pinyin}</span>}
          </div>
          <p className="text-sm text-muted-foreground">{selected.alamat ?? "-"}</p>
          <p className="text-sm text-muted-foreground">
            {selected.no_whatsapp || "(tanpa no HP)"} · {selected.buku_nama ?? "tanpa buku"}
          </p>
          {selected.terakhir && (
            <p className="flex items-center gap-1.5 text-sm">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              Setoran terakhir <b className="tabular-nums">{formatRupiah(selected.terakhir.nominal)}</b>
              <span className="text-muted-foreground">
                ({selected.terakhir.kegiatan}, {formatTanggalWITA(selected.terakhir.tanggal, { day: "numeric", month: "long", year: "numeric" })})
              </span>
            </p>
          )}
          <Link href={`/anggota/${selected.id}`} className="text-xs underline">Lihat seluruh riwayat</Link>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <X /> Ganti
        </Button>
      </div>

      <TambahDonasiForm
        key={selected.id}
        anggotaId={selected.id}
        kegiatan={kegiatan}
        kegiatanAwalId={kegiatanAwalId}
        noWhatsappSekarang={selected.no_whatsapp}
      />
    </div>
  );
}
