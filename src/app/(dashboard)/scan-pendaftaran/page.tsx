import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getKegiatanAktif, getSemuaKegiatan } from "@/lib/kegiatan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanPendaftaranClient } from "./register-client";

// Beri ruang waktu untuk upload bukti transfer di serverless.
export const maxDuration = 60;

export default async function InputDonasiPage() {
  await requireProfile(["admin", "petugas_pendaftaran"]);
  const [semuaKegiatan, kegiatanAktif] = await Promise.all([getSemuaKegiatan(), getKegiatanAktif()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Input Donasi</h1>
          <p className="text-sm text-muted-foreground">
            Cari anggota, lihat setoran terakhirnya, lalu catat setoran baru{kegiatanAktif ? ` untuk ${kegiatanAktif.nama}` : ""}.
          </p>
        </div>
        <Link
          href="/anggota/tambah"
          className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4"
        >
          <UserPlus /> Anggota baru (belum ada)
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catat Setoran</CardTitle>
          <CardDescription>
            Untuk orang yang <b>belum tercatat sama sekali</b>, gunakan tombol &quot;Anggota baru&quot; di atas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {semuaKegiatan.length ? (
            <ScanPendaftaranClient
              kegiatan={semuaKegiatan.map((k) => ({ id: k.id, nama: k.nama, aktif: k.aktif, pakai_kupon: k.pakai_kupon }))}
              kegiatanAwalId={kegiatanAktif?.id ?? semuaKegiatan[0].id}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada kegiatan. Admin perlu membuat kegiatan dulu.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
