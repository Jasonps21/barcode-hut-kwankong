import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PesertaForm } from "./peserta-form";

// Beri ruang waktu untuk pengiriman WA via `after()` di serverless.
export const maxDuration = 60;

export default async function TambahPesertaPage() {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const isAdmin = profile.role === "admin";

  // Untuk kasus "tidak mengambil kupon", admin perlu memilih kelompok manual
  // (kelompok tidak bisa ditentukan otomatis tanpa kupon).
  let kelompokOptions: { id: string; nama: string }[] = [];
  const supabase = await createClient();
  if (isAdmin) {
    const { data } = await supabase
      .from("kelompok")
      .select("id, nama")
      .order("nama", { ascending: true });
    kelompokOptions = (data ?? []) as { id: string; nama: string }[];
  }

  const { data: jenisUsahaData } = await supabase
    .from("jenis_usaha")
    .select("id, nama")
    .order("nama", { ascending: true });
  const jenisUsahaOptions = (jenisUsahaData ?? []) as { id: string; nama: string }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tambah Peserta</h1>
        <p className="text-sm text-muted-foreground">Input data peserta + scan kupon. WA otomatis dikirim setelah simpan.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Data Peserta & Kupon</CardTitle>
          <CardDescription>Isi data lengkap, lalu scan/ketik nomor kupon (boleh lebih dari satu). Semua kupon harus dari kelompok yang sama.</CardDescription>
        </CardHeader>
        <CardContent>
          <PesertaForm isAdmin={isAdmin} kelompokOptions={kelompokOptions} jenisUsahaOptions={jenisUsahaOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
