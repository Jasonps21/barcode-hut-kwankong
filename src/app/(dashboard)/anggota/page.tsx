import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, UserPlus, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatTanggalWITA } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PER_HALAMAN = 25;

interface AnggotaRow {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  no_whatsapp: string | null;
  alamat: string | null;
  aktif: boolean;
  buku_id: string | null;
  kelompok: { nama: string } | null;
}

export default async function AnggotaPage(props: {
  searchParams: Promise<{ q?: string; buku?: string; page?: string }>;
}) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const sp = await props.searchParams;
  const supabase = await createClient();

  const q = (sp.q ?? "").trim();
  const halaman = Math.max(1, Number(sp.page ?? "1") || 1);

  // Petugas dikunci ke bukunya sendiri; RLS sudah menyaring, penyaring di sini
  // hanya supaya tampilan & jumlah halaman ikut benar.
  const bukuFilter =
    profile.role === "admin"
      ? (sp.buku && sp.buku !== "all" ? sp.buku : null)
      : profile.kelompok_id;

  const query = supabase
    .from("anggota")
    .select("id, nama, nama_hanzi, no_whatsapp, alamat, aktif, buku_id, kelompok:buku_id(nama)", { count: "exact" })
    .order("nama");

  if (bukuFilter) query.eq("buku_id", bukuFilter);
  if (q) {
    const like = `%${q}%`;
    query.or([
      `nama.ilike.${like}`,
      `nama_hanzi.ilike.${like}`,
      `pinyin.ilike.${like}`,
      `no_whatsapp.ilike.${like}`,
      `alamat.ilike.${like}`,
    ].join(","));
  }
  query.range((halaman - 1) * PER_HALAMAN, halaman * PER_HALAMAN - 1);

  const [{ data, count }, { data: kelompokData }] = await Promise.all([
    query,
    supabase.from("kelompok").select("id, nama").order("nama"),
  ]);

  const anggota = (data ?? []) as unknown as AnggotaRow[];
  const kelompokList = (kelompokData ?? []) as { id: string; nama: string }[];
  const total = count ?? 0;
  const totalHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

  // Total & setoran terakhir per anggota untuk baris yang tampil saja — bukan
  // untuk seluruh tabel, supaya halaman tetap ringan. Setoran terakhir adalah
  // angka acuan penagih: "tahun lalu Bapak menyumbang sekian".
  const totalPerAnggota = new Map<string, number>();
  const terakhirPerAnggota = new Map<string, { nominal: number; tanggal: string; kegiatan: string }>();
  if (anggota.length) {
    const { data: donasiData } = await supabase
      .from("donasi")
      .select("anggota_id, nominal, tanggal, kegiatan(nama)")
      .in("anggota_id", anggota.map((a) => a.id))
      .order("tanggal", { ascending: false });
    for (const d of (donasiData ?? []) as unknown as {
      anggota_id: string; nominal: number | string; tanggal: string; kegiatan: { nama: string } | null;
    }[]) {
      totalPerAnggota.set(d.anggota_id, (totalPerAnggota.get(d.anggota_id) ?? 0) + Number(d.nominal ?? 0));
      if (!terakhirPerAnggota.has(d.anggota_id)) {
        terakhirPerAnggota.set(d.anggota_id, {
          nominal: Number(d.nominal ?? 0),
          tanggal: d.tanggal,
          kegiatan: d.kegiatan?.nama ?? "-",
        });
      }
    }
  }

  function hrefHalaman(n: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sp.buku) params.set("buku", sp.buku);
    params.set("page", String(n));
    return `/anggota?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Anggota</h1>
          <p className="text-sm text-muted-foreground">
            Daftar anggota tetap — riwayat sumbangannya tersimpan lintas kegiatan.
          </p>
        </div>
        <Link
          href="/anggota/tambah"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 [&_svg]:size-4"
        >
          <UserPlus /> Tambah Anggota
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Cari Anggota
          </CardTitle>
          <CardDescription>
            {total} anggota{bukuFilter ? " di buku ini" : ""}. Klik nama untuk melihat riwayat sumbangan
            dan mencatat setoran baru.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Cari nama, hanzi, nomor WA, atau alamat…"
                className="pl-9"
              />
            </div>
            {profile.role === "admin" && (
              <Select name="buku" defaultValue={sp.buku ?? "all"} className="w-auto">
                <option value="all">Semua buku</option>
                {kelompokList.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </Select>
            )}
            <Button type="submit" variant="outline">Cari</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Buku</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Donasi Terakhir</TableHead>
                  <TableHead className="text-right">Total Sumbangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anggota.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Tidak ada anggota yang cocok.
                    </TableCell>
                  </TableRow>
                )}
                {anggota.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/anggota/${a.id}`} className="font-medium hover:underline">
                        {a.nama}
                      </Link>
                      {a.nama_hanzi && (
                        <span className="block text-xs text-muted-foreground">{a.nama_hanzi}</span>
                      )}
                      {!a.aktif && <Badge variant="destructive" className="mt-1">Tidak aktif</Badge>}
                    </TableCell>
                    <TableCell>
                      {a.kelompok?.nama ? <Badge variant="outline">{a.kelompok.nama}</Badge> : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{a.no_whatsapp || "-"}</TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const t = terakhirPerAnggota.get(a.id);
                        if (!t) return <span className="text-muted-foreground">Belum pernah</span>;
                        return (
                          <>
                            <span className="font-medium tabular-nums">{formatRupiah(t.nominal)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t.kegiatan} · {formatTanggalWITA(t.tanggal, { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatRupiah(totalPerAnggota.get(a.id) ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalHalaman > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Halaman {halaman} dari {totalHalaman}</p>
          <div className="flex gap-2">
            {halaman > 1 && (
              <Link
                href={hrefHalaman(halaman - 1)}
                className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-sm shadow-sm hover:bg-accent"
              >
                <ChevronLeft className="h-4 w-4" /> Sebelumnya
              </Link>
            )}
            {halaman < totalHalaman && (
              <Link
                href={hrefHalaman(halaman + 1)}
                className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-sm shadow-sm hover:bg-accent"
              >
                Berikutnya <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
