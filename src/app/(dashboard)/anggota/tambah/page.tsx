import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getKegiatanAktif } from "@/lib/kegiatan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnggotaForm } from "./anggota-form";

// Beri ruang waktu untuk upload bukti transfer di serverless.
export const maxDuration = 60;

export default async function TambahAnggotaPage() {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const [{ data: bukuData }, { data: jenisUsahaData }, kegiatanAktif] = await Promise.all([
    isAdmin
      ? supabase.from("kelompok").select("id, nama").order("nama", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase.from("jenis_usaha").select("id, nama").order("nama", { ascending: true }),
    getKegiatanAktif(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/anggota" className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-accent [&_svg]:size-4">
          <ArrowLeft />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tambah Anggota</h1>
          <p className="text-sm text-muted-foreground">
            Untuk orang yang belum pernah tercatat. Kalau sudah ada, cari di halaman Anggota lalu tambah setorannya di sana.
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Data Anggota</CardTitle>
          <CardDescription>
            Identitas disimpan sekali dan dipakai di semua kegiatan. Setoran pertama boleh langsung diisi di bawah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnggotaForm
            isAdmin={isAdmin}
            bukuOptions={(bukuData ?? []) as { id: string; nama: string }[]}
            jenisUsahaOptions={(jenisUsahaData ?? []) as { id: string; nama: string }[]}
            kegiatan={
              kegiatanAktif
                ? { id: kegiatanAktif.id, nama: kegiatanAktif.nama, aktif: kegiatanAktif.aktif, pakai_kupon: kegiatanAktif.pakai_kupon }
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
