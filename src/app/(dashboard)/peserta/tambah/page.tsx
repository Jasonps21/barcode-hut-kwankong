import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PesertaForm } from "./peserta-form";

// Beri ruang waktu untuk pengiriman WA via `after()` di serverless.
export const maxDuration = 60;

export default async function TambahPesertaPage() {
  await requireProfile(["admin", "petugas_pendaftaran"]);

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
          <PesertaForm />
        </CardContent>
      </Card>
    </div>
  );
}
