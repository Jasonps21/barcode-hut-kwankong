import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, History, Phone, MapPin, Pencil } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getKegiatanAktif } from "@/lib/kegiatan";
import { formatRupiah, formatTanggalWITA, formatTanggalJamWITA } from "@/lib/utils";
import { buatPesanPengingat, totalRiwayat, type BarisRiwayat } from "@/lib/riwayat-donasi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TambahDonasiForm } from "./tambah-donasi-form";
import { PindahBukuForm } from "./pindah-buku-form";
import { SalinPengingat } from "./salin-pengingat";

// Ruang waktu untuk upload bukti transfer pada form tambah donasi.
export const maxDuration = 60;

interface AnggotaDetail {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  alamat: string | null;
  no_whatsapp: string | null;
  kota_kabupaten: string | null;
  provinsi: string | null;
  keterangan: string | null;
  buku_id: string | null;
  aktif: boolean;
  kelompok: { nama: string } | null;
  jenis_usaha: { nama: string } | null;
}

interface DonasiRow {
  id: string;
  nominal: number | string;
  tanggal: string;
  metode_bayar: string;
  nomor_tt: number | null;
  keterangan: string | null;
  kegiatan: { nama: string; tahun: number | null } | null;
  kelompok: { nama: string } | null;
}

export default async function AnggotaDetailPage(props: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: anggotaData } = await supabase
    .from("anggota")
    .select("id, nama, nama_hanzi, alamat, no_whatsapp, kota_kabupaten, provinsi, keterangan, buku_id, aktif, kelompok:buku_id(nama), jenis_usaha(nama)")
    .eq("id", id)
    .maybeSingle();

  // RLS sudah menyaring anggota di luar buku petugas, jadi "tidak ketemu" di
  // sini juga berarti "tidak berhak melihat".
  if (!anggotaData) notFound();
  const anggota = anggotaData as unknown as AnggotaDetail;

  const [{ data: donasiData }, { data: kelompokData }, { data: riwayatBukuData }, kegiatanAktif] =
    await Promise.all([
      supabase
        .from("donasi")
        .select("id, nominal, tanggal, metode_bayar, nomor_tt, keterangan, kegiatan(nama, tahun), kelompok:kelompok_id(nama)")
        .eq("anggota_id", id)
        .order("tanggal", { ascending: false }),
      supabase.from("kelompok").select("id, nama").order("nama"),
      supabase
        .from("anggota_buku_riwayat")
        .select("id, alasan, created_at, dari:dari_buku_id(nama), ke:ke_buku_id(nama)")
        .eq("anggota_id", id)
        .order("created_at", { ascending: false }),
      getKegiatanAktif(),
    ]);

  const donasi = (donasiData ?? []) as unknown as DonasiRow[];
  const kelompokList = (kelompokData ?? []) as { id: string; nama: string }[];
  const riwayatBuku = (riwayatBukuData ?? []) as unknown as {
    id: string; alasan: string | null; created_at: string;
    dari: { nama: string } | null; ke: { nama: string } | null;
  }[];

  // Jumlah kupon per donasi diambil sekali untuk semua baris, bukan satu query
  // per baris.
  const { data: kuponData } = await supabase
    .from("kupon")
    .select("donasi_id")
    .in("donasi_id", donasi.length ? donasi.map((d) => d.id) : ["00000000-0000-0000-0000-000000000000"]);
  const kuponPerDonasi = new Map<string, number>();
  for (const k of (kuponData ?? []) as { donasi_id: string }[]) {
    kuponPerDonasi.set(k.donasi_id, (kuponPerDonasi.get(k.donasi_id) ?? 0) + 1);
  }

  const baris: BarisRiwayat[] = donasi.map((d) => ({
    kegiatan: d.kegiatan?.nama ?? "(tanpa kegiatan)",
    tanggal: d.tanggal,
    nominal: d.nominal,
    buku: d.kelompok?.nama ?? null,
    jumlahKupon: kuponPerDonasi.get(d.id) ?? 0,
  }));
  const total = totalRiwayat(baris);
  const pesanPengingat = buatPesanPengingat(anggota.nama, baris);

  // Dikelompokkan per kegiatan supaya beberapa setoran di acara yang sama
  // terbaca sebagai satu blok, bukan baris-baris lepas.
  const perKegiatan = new Map<string, { nama: string; total: number; jumlahSetoran: number }>();
  for (const d of donasi) {
    const nama = d.kegiatan?.nama ?? "(tanpa kegiatan)";
    const k = perKegiatan.get(nama) ?? { nama, total: 0, jumlahSetoran: 0 };
    k.total += Number(d.nominal ?? 0);
    k.jumlahSetoran += 1;
    perKegiatan.set(nama, k);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/anggota" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Kembali ke daftar anggota
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{anggota.nama}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {anggota.nama_hanzi && <span>{anggota.nama_hanzi}</span>}
            {anggota.kelompok?.nama && <Badge variant="outline">{anggota.kelompok.nama}</Badge>}
            {!anggota.aktif && <Badge variant="destructive">Tidak aktif</Badge>}
            {anggota.jenis_usaha?.nama && <Badge variant="secondary">{anggota.jenis_usaha.nama}</Badge>}
          </div>
        </div>
        {profile.role === "admin" && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/anggota/${anggota.id}/edit`}
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-4"
            >
              <Pencil /> Ubah data
            </Link>
            <PindahBukuForm
              anggotaId={anggota.id}
              anggotaNama={anggota.nama}
              bukuSekarangId={anggota.buku_id}
              kelompokList={kelompokList}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> Riwayat Sumbangan
            </CardTitle>
            <CardDescription>
              Bacakan ini saat menagih — agar anggota langsung teringat tanpa harus mengingat sendiri.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {donasi.length === 0 ? (
              <p className="rounded-md bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                Belum ada catatan sumbangan untuk anggota ini.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kegiatan</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead className="text-right">Nominal</TableHead>
                        <TableHead>Buku saat itu</TableHead>
                        <TableHead className="text-right">Kupon</TableHead>
                        <TableHead>No. TT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {donasi.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">
                            {profile.role === "admin" ? (
                              <Link href={`/transaksi/${d.id}`} className="hover:underline" title="Ubah setoran ini">
                                {d.kegiatan?.nama ?? "-"}
                              </Link>
                            ) : (
                              d.kegiatan?.nama ?? "-"
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatTanggalWITA(d.tanggal, { day: "numeric", month: "long", year: "numeric" })}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatRupiah(d.nominal)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{d.kelompok?.nama ?? "-"}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{kuponPerDonasi.get(d.id) ?? 0}</TableCell>
                          <TableCell className="tabular-nums">{d.nomor_tt ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total seumur keanggotaan: </span>
                    <span className="text-lg font-bold tabular-nums">{formatRupiah(total)}</span>
                    <span className="text-muted-foreground"> dari {donasi.length} setoran</span>
                  </div>
                  <SalinPengingat pesan={pesanPengingat} noWhatsapp={anggota.no_whatsapp} />
                </div>

                {perKegiatan.size > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {[...perKegiatan.values()].map((k) => (
                      <div key={k.nama} className="rounded-md border px-3 py-2 text-sm">
                        <p className="font-medium">{k.nama}</p>
                        <p className="tabular-nums text-muted-foreground">
                          {formatRupiah(k.total)}
                          {k.jumlahSetoran > 1 && ` · ${k.jumlahSetoran}x setor`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Anggota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {anggota.no_whatsapp && (
              <p className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{anggota.no_whatsapp}</span>
              </p>
            )}
            {anggota.alamat && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {anggota.alamat}
                  {(anggota.kota_kabupaten || anggota.provinsi) && (
                    <span className="block text-muted-foreground">
                      {[anggota.kota_kabupaten, anggota.provinsi].filter(Boolean).join(", ")}
                    </span>
                  )}
                </span>
              </p>
            )}
            {anggota.keterangan && (
              <p className="rounded-md bg-muted/50 px-2 py-1 text-muted-foreground">{anggota.keterangan}</p>
            )}

            {riwayatBuku.length > 0 && (
              <div className="border-t pt-3">
                <p className="mb-2 flex items-center gap-2 font-medium">
                  <ArrowRightLeft className="h-4 w-4" /> Riwayat pindah buku
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {riwayatBuku.map((r) => (
                    <li key={r.id}>
                      <span className="font-medium text-foreground">
                        {r.dari?.nama ?? "(belum ada)"} → {r.ke?.nama ?? "-"}
                      </span>
                      <br />
                      {formatTanggalJamWITA(r.created_at)}
                      {r.alasan && ` · ${r.alasan}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tambah Sumbangan Baru</CardTitle>
          <CardDescription>
            {kegiatanAktif
              ? `Setoran dicatat untuk kegiatan "${kegiatanAktif.nama}". Anggota boleh menyetor berkali-kali di kegiatan yang sama — tiap setoran punya tanggal dan nomor tanda terima sendiri.`
              : "Belum ada kegiatan aktif. Admin perlu mengaktifkan kegiatan dulu sebelum donasi bisa dicatat."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {kegiatanAktif ? (
            <TambahDonasiForm
              anggotaId={anggota.id}
              kegiatan={{
                id: kegiatanAktif.id,
                nama: kegiatanAktif.nama,
                aktif: kegiatanAktif.aktif,
                pakai_kupon: kegiatanAktif.pakai_kupon,
              }}
            />
          ) : (
            <Link
              href="/kegiatan"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              Buka halaman Kegiatan
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
