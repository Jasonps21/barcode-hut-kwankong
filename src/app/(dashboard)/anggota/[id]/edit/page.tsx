import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile, canEditPeserta } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditAnggotaForm, type EditAnggota } from "./edit-form";

export default async function EditAnggotaPage(props: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const { id } = await props.params;
  if (!canEditPeserta(profile)) redirect(`/anggota/${id}`);
  const admin = createAdminClient();

  const [{ data: anggotaData }, { data: jenisUsahaData }, { data: nomorUsahaData }] = await Promise.all([
    admin
      .from("anggota")
      .select("id, nama, nama_hanzi, alamat, no_whatsapp, kota_kabupaten, provinsi, jenis_usaha_id, keterangan, buku_id, kelompok:buku_id(nama)")
      .eq("id", id)
      .maybeSingle(),
    admin.from("jenis_usaha").select("id, nama").order("nama", { ascending: true }),
    admin
      .from("anggota_nomor_usaha")
      .select("label, nomor, sama_dengan_wa")
      .eq("anggota_id", id)
      .order("urutan"),
  ]);
  if (!anggotaData) notFound();
  const a = anggotaData as unknown as EditAnggota & { buku_id: string | null; kelompok: { nama: string } | null };
  if (profile.role !== "admin" && a.buku_id !== profile.kelompok_id) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/anggota/${id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-accent [&_svg]:size-4">
          <ArrowLeft />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ubah Data Anggota</h1>
          <p className="text-sm text-muted-foreground">{a.nama} · {a.kelompok?.nama ?? "tanpa buku"}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identitas</CardTitle>
          <CardDescription>
            Berlaku untuk semua kegiatan. Nominal setoran diubah dari menu Transaksi, buku dari tombol Pindah Buku.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditAnggotaForm
            anggota={a}
            jenisUsahaOptions={(jenisUsahaData ?? []) as { id: string; nama: string }[]}
            nomorUsahaAwal={(nomorUsahaData ?? []) as Array<{ label: string | null; nomor: string; sama_dengan_wa: boolean }>}
          />
        </CardContent>
      </Card>
    </div>
  );
}
