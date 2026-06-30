import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanPendaftaranClient } from "./register-client";

// Beri ruang waktu untuk pengiriman WA via `after()` di serverless.
export const maxDuration = 60;

export default async function ScanPendaftaranPage() {
  await requireProfile(["admin", "petugas_pendaftaran"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scan Pendaftaran</h1>
          <p className="text-sm text-muted-foreground">
            Cari peserta yang sudah terdaftar (hasil impor buku), isi nominal &amp; metode bayar, lalu scan kupon untuk di-assign.
          </p>
        </div>
        <Link
          href="/peserta/tambah"
          className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4"
        >
          <UserPlus /> Peserta baru (belum ada)
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftarkan Peserta &amp; Assign Kupon</CardTitle>
          <CardDescription>
            Untuk peserta yang <b>belum ada sama sekali</b>, gunakan tombol &quot;Peserta baru&quot; di atas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScanPendaftaranClient />
        </CardContent>
      </Card>
    </div>
  );
}
