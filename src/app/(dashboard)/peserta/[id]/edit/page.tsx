import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus, Ticket, X } from "lucide-react";
import { requireProfile, canEditPeserta } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EditPesertaForm } from "./edit-form";
import { assignKuponAction, unassignKuponAction } from "../../actions";

export default async function EditPesertaPage(props: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) redirect("/peserta");
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data: peserta } = await admin
    .from("peserta")
    .select("id, nama, nama_hanzi, pinyin, alamat, no_whatsapp, nominal_donasi, metode_bayar, kota_kabupaten, provinsi, jenis_usaha_id, keterangan, kelompok_id, kelompok(nama)")
    .eq("id", id)
    .single();
  if (!peserta) notFound();
  const p = peserta as unknown as {
    id: string; nama: string; nama_hanzi: string | null; pinyin: string | null;
    alamat: string; no_whatsapp: string; nominal_donasi: number | string;
    metode_bayar: string | null; kota_kabupaten: string | null; provinsi: string | null;
    jenis_usaha_id: string | null; keterangan: string | null;
    kelompok_id: string; kelompok: { nama: string } | null;
  };
  if (profile.role !== "admin" && p.kelompok_id !== profile.kelompok_id) notFound();

  const { data: jenisUsahaData } = await admin
    .from("jenis_usaha")
    .select("id, nama")
    .order("nama", { ascending: true });
  const jenisUsahaOptions = (jenisUsahaData ?? []) as { id: string; nama: string }[];

  const { data: kuponData } = await admin
    .from("kupon")
    .select("id, nomor_kupon, status")
    .eq("peserta_id", id)
    .order("nomor_kupon");
  const kupons = (kuponData ?? []) as Array<{ id: string; nomor_kupon: string; status: string }>;

  const { data: nomorUsahaData } = await admin
    .from("peserta_nomor_usaha")
    .select("label, nomor, sama_dengan_wa")
    .eq("peserta_id", id)
    .order("urutan");
  const nomorUsahaAwal = (nomorUsahaData ?? []) as Array<{ label: string | null; nomor: string; sama_dengan_wa: boolean }>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/peserta" className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-accent [&_svg]:size-4">
          <ArrowLeft />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Peserta</h1>
          <p className="text-sm text-muted-foreground">{p.nama} · Kelompok {p.kelompok?.nama ?? "-"}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Peserta</CardTitle>
          <CardDescription>Ubah data lalu simpan.</CardDescription>
        </CardHeader>
        <CardContent>
          <EditPesertaForm peserta={p} jenisUsahaOptions={jenisUsahaOptions} nomorUsahaAwal={nomorUsahaAwal} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kupon Ter-assign</CardTitle>
          <CardDescription>Tambah atau lepas kupon untuk peserta ini. Kupon yang sudah <b>ditukar</b> tidak bisa dilepas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {kupons.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kupon untuk peserta ini.</p>}
          {kupons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {kupons.map((k) => (
                <div key={k.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                  <Ticket className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-sm">{k.nomor_kupon}</span>
                  <Badge variant={k.status === "redeemed" ? "success" : "secondary"} className="text-[10px] capitalize">{k.status}</Badge>
                  {k.status !== "redeemed" && (
                    <form action={unassignKuponAction}>
                      <input type="hidden" name="peserta_id" value={p.id} />
                      <input type="hidden" name="kupon_id" value={k.id} />
                      <ConfirmButton
                        type="submit"
                        variant="ghost"
                        size="sm"
                        message={`Lepas kupon ${k.nomor_kupon} dari ${p.nama}? Kupon akan kembali tersedia.`}
                        className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-3.5 w-3.5" />
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          <form action={assignKuponAction} className="flex gap-2">
            <input type="hidden" name="peserta_id" value={p.id} />
            <Input name="nomor_kupon" placeholder="Tambah kupon: ketik nomor mis. 2026A0001" className="sm:max-w-xs" required />
            <Button type="submit" variant="outline"><Plus /> Assign</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
