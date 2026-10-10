import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus, Ticket, Trash2, X } from "lucide-react";
import { requireProfile, canEditPeserta, canDeletePeserta } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBuktiSignedUrl } from "@/lib/bukti";
import { dateKeyWITA, formatRupiah, formatTanggalJamWITA } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EditDonasiForm } from "./edit-donasi-form";
import { assignKuponDonasiAction, hapusDonasiAction, lepasKuponDonasiAction } from "../actions";

// Ruang waktu untuk upload bukti transfer pengganti.
export const maxDuration = 60;

interface DonasiDetail {
  id: string;
  anggota_id: string;
  kegiatan_id: string;
  kelompok_id: string;
  nama: string;
  nominal_donasi: number | string;
  metode_bayar: string;
  bukti_transfer_path: string | null;
  registered_at: string;
  nomor_tt: number | null;
  keterangan: string | null;
  kegiatan_nama: string | null;
  kelompok: { nama: string } | null;
}

export default async function DonasiDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) redirect("/transaksi");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const admin = createAdminClient();

  const { data } = await admin
    .from("donasi_lengkap")
    .select("id, anggota_id, kegiatan_id, kelompok_id, nama, nominal_donasi, metode_bayar, bukti_transfer_path, registered_at, nomor_tt, keterangan, kegiatan_nama, kelompok:kelompok_id(nama)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const d = data as unknown as DonasiDetail;
  if (profile.role !== "admin" && d.kelompok_id !== profile.kelompok_id) notFound();

  const [{ data: kuponData }, { data: kegiatanData }, buktiUrl] = await Promise.all([
    admin.from("kupon").select("id, nomor_kupon, status").eq("donasi_id", id).order("nomor_kupon"),
    admin.from("kegiatan").select("pakai_kupon").eq("id", d.kegiatan_id).maybeSingle(),
    getBuktiSignedUrl(admin, d.bukti_transfer_path),
  ]);
  const kupons = (kuponData ?? []) as Array<{ id: string; nomor_kupon: string; status: string }>;
  const pakaiKupon = Boolean((kegiatanData as { pakai_kupon: boolean } | null)?.pakai_kupon);
  const adaYangDitukar = kupons.some((k) => k.status === "redeemed");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/anggota/${d.anggota_id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-accent [&_svg]:size-4">
          <ArrowLeft />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ubah Setoran</h1>
          <p className="text-sm text-muted-foreground">
            {d.nama} · {d.kegiatan_nama ?? "-"} · {d.kelompok?.nama ?? "-"}
            {d.nomor_tt ? ` · No. TT ${d.nomor_tt}` : ""}
          </p>
        </div>
      </div>

      {sp.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{formatRupiah(d.nominal_donasi)}</CardTitle>
          <CardDescription>
            Tercatat {formatTanggalJamWITA(d.registered_at)}.
            {buktiUrl && (
              <>
                {" "}
                <a href={buktiUrl} target="_blank" rel="noopener noreferrer" className="underline">Lihat bukti transfer</a>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditDonasiForm
            donasi={{
              id: d.id,
              nominal: Number(d.nominal_donasi ?? 0),
              metode_bayar: d.metode_bayar,
              tanggal: dateKeyWITA(d.registered_at),
              keterangan: d.keterangan,
              punyaBukti: Boolean(d.bukti_transfer_path),
            }}
          />
        </CardContent>
      </Card>

      {(pakaiKupon || kupons.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Kupon Setoran Ini</CardTitle>
            <CardDescription>Tambah atau lepas kupon. Kupon yang sudah <b>ditukar</b> tidak bisa dilepas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kupons.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kupon untuk setoran ini.</p>}
            {kupons.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {kupons.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                    <Ticket className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm">{k.nomor_kupon}</span>
                    <Badge variant={k.status === "redeemed" ? "success" : "secondary"} className="text-[10px]">
                      {k.status === "redeemed" ? "ditukar" : "dipegang"}
                    </Badge>
                    {k.status !== "redeemed" && (
                      <form action={lepasKuponDonasiAction}>
                        <input type="hidden" name="donasi_id" value={d.id} />
                        <input type="hidden" name="kupon_id" value={k.id} />
                        <ConfirmButton
                          type="submit"
                          variant="ghost"
                          size="sm"
                          message={`Lepas kupon ${k.nomor_kupon} dari ${d.nama}? Kupon akan kembali tersedia.`}
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

            {pakaiKupon && (
              <form action={assignKuponDonasiAction} className="flex gap-2">
                <input type="hidden" name="donasi_id" value={d.id} />
                <Input name="nomor_kupon" placeholder="Tambah kupon: ketik nomor mis. 2026A0001" className="sm:max-w-xs" required />
                <Button type="submit" variant="outline"><Plus /> Tambah</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {canDeletePeserta(profile) && (
        <Card>
          <CardHeader>
            <CardTitle>Hapus Setoran</CardTitle>
            <CardDescription>
              {adaYangDitukar
                ? "Tidak bisa dihapus: ada kupon yang sudah ditukar dengan bingkisan."
                : "Untuk setoran yang salah input. Kupon yang belum ditukar kembali tersedia. Anggotanya tetap ada."}
            </CardDescription>
          </CardHeader>
          {!adaYangDitukar && (
            <CardContent>
              <form action={hapusDonasiAction}>
                <input type="hidden" name="donasi_id" value={d.id} />
                <ConfirmButton
                  type="submit"
                  variant="destructive"
                  message={`Hapus setoran ${formatRupiah(d.nominal_donasi)} dari ${d.nama}? Aksi ini tidak bisa dibatalkan.`}
                >
                  <Trash2 /> Hapus setoran
                </ConfirmButton>
              </form>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
