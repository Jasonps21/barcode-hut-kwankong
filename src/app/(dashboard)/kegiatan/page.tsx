import { CalendarDays, CheckCircle2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatTanggalWITA } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { KegiatanForm } from "./kegiatan-form";
import { aktifkanKegiatanAction, ubahPakaiKuponAction } from "./actions";

interface KegiatanRow {
  id: string;
  nama: string;
  tahun: number | null;
  tanggal_mulai: string | null;
  aktif: boolean;
  pakai_kupon: boolean;
  keterangan: string | null;
}

export default async function KegiatanPage() {
  await requireProfile(["admin"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("kegiatan")
    .select("id, nama, tahun, tanggal_mulai, aktif, pakai_kupon, keterangan")
    .order("tahun", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const kegiatan = (data ?? []) as KegiatanRow[];

  // Ringkasan uang & jumlah setoran per kegiatan, diambil sekali lalu
  // dijumlahkan di sini — menghindari satu query per baris.
  const ringkasan = new Map<string, { total: number; setoran: number }>();
  if (kegiatan.length) {
    const { data: donasiData } = await supabase.from("donasi").select("kegiatan_id, nominal");
    for (const d of (donasiData ?? []) as { kegiatan_id: string; nominal: number | string }[]) {
      const r = ringkasan.get(d.kegiatan_id) ?? { total: 0, setoran: 0 };
      r.total += Number(d.nominal ?? 0);
      r.setoran += 1;
      ringkasan.set(d.kegiatan_id, r);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kegiatan</h1>
        <p className="text-sm text-muted-foreground">
          Tiap acara penggalangan dana berdiri sendiri. Nomor kupon dan nomor tanda terima
          mulai dari awal lagi di kegiatan baru, tapi riwayat anggota tetap nyambung.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buat Kegiatan Baru</CardTitle>
          <CardDescription>
            Contoh: &quot;Bakti Sosial Imlek 2027&quot;. Kegiatan baru tidak langsung aktif —
            aktifkan saat sudah siap menerima setoran.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KegiatanForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Daftar Kegiatan
          </CardTitle>
          <CardDescription>{kegiatan.length} kegiatan tercatat.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead className="text-right">Terkumpul</TableHead>
                  <TableHead className="text-right">Setoran</TableHead>
                  <TableHead>Kupon</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kegiatan.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Belum ada kegiatan.
                    </TableCell>
                  </TableRow>
                )}
                {kegiatan.map((k) => {
                  const r = ringkasan.get(k.id) ?? { total: 0, setoran: 0 };
                  return (
                    <TableRow key={k.id}>
                      <TableCell>
                        <span className="font-medium">{k.nama}</span>
                        {k.keterangan && (
                          <span className="block text-xs text-muted-foreground">{k.keterangan}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {k.tanggal_mulai ? formatTanggalWITA(k.tanggal_mulai) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupiah(r.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.setoran}</TableCell>
                      <TableCell>
                        <form action={ubahPakaiKuponAction} className="flex items-center gap-2">
                          <input type="hidden" name="kegiatan_id" value={k.id} />
                          <input type="hidden" name="pakai_kupon" value={String(!k.pakai_kupon)} />
                          {k.pakai_kupon ? (
                            <Badge variant="secondary">Pakai kupon</Badge>
                          ) : (
                            <Badge variant="outline">Tanpa kupon</Badge>
                          )}
                          <ConfirmButton
                            variant="ghost"
                            size="sm"
                            message={
                              k.pakai_kupon
                                ? `Matikan kupon untuk "${k.nama}"? Donasi berikutnya dicatat tanpa kupon. Kupon yang sudah dibagikan tetap tersimpan.`
                                : `Nyalakan kupon untuk "${k.nama}"? Form donasi akan meminta nomor kupon lagi.`
                            }
                          >
                            {k.pakai_kupon ? "Matikan" : "Nyalakan"}
                          </ConfirmButton>
                        </form>
                      </TableCell>
                      <TableCell>
                        {k.aktif ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Berjalan
                          </Badge>
                        ) : (
                          <form action={aktifkanKegiatanAction}>
                            <input type="hidden" name="kegiatan_id" value={k.id} />
                            <ConfirmButton
                              variant="outline"
                              size="sm"
                              message={`Jadikan "${k.nama}" sebagai kegiatan berjalan?

Kegiatan yang sekarang aktif akan dinonaktifkan, dan SEMUA input donasi oleh semua petugas akan langsung masuk ke "${k.nama}".`}
                            >
                              Aktifkan
                            </ConfirmButton>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
