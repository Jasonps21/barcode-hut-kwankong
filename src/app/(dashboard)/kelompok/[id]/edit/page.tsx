import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getKegiatanAktif } from "@/lib/kegiatan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditKelompokForm } from "./edit-form";

const PREFIX_RE = /^[A-Za-z0-9-]+$/;

export default async function EditKelompokPage(props: { params: Promise<{ id: string }> }) {
  await requireProfile(["admin"]);
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("kelompok")
    .select("id, nama, prefix, range_start, range_end, padding")
    .eq("id", id)
    .single();
  if (!data) notFound();
  const legacy = data as { id: string; nama: string; prefix: string; range_start: number; range_end: number; padding: number };

  // Rentang yang diedit adalah milik kegiatan berjalan; kolom lama di
  // `kelompok` hanya jadi nilai awal bila kegiatan ini belum punya rentang.
  const aktif = await getKegiatanAktif();
  const kegiatan = aktif?.pakai_kupon ? aktif : null;
  const { data: rangeData } = kegiatan
    ? await admin
        .from("kegiatan_kupon_range")
        .select("prefix, range_start, range_end, padding")
        .eq("kegiatan_id", kegiatan.id)
        .eq("kelompok_id", id)
        .maybeSingle()
    : { data: null };
  const k = { ...legacy, ...((rangeData as Omit<typeof legacy, "id" | "nama"> | null) ?? {}) };

  const kupon = (terpakai: boolean) => {
    let q = admin.from("kupon").select("id", { count: "exact", head: true })
      .eq("kelompok_id", id)
      .eq("kegiatan_id", kegiatan?.id ?? "00000000-0000-0000-0000-000000000000");
    if (terpakai) q = q.neq("status", "available");
    return q;
  };
  const [{ count: kuponCount }, { count: assignedCount }, { count: pesertaCount }] = await Promise.all([
    kupon(false),
    kupon(true),
    admin.from("anggota").select("id", { count: "exact", head: true }).eq("buku_id", id),
  ]);

  // Nilai awal form — kosongkan placeholder yang tidak valid (mis. kelompok BUKU hasil impor).
  const prefixDefault = PREFIX_RE.test(k.prefix) ? k.prefix : "";
  const startDefault = k.range_start > 0 ? String(k.range_start).padStart(k.padding, "0") : "";
  const endDefault = k.range_end > 0 ? String(k.range_end).padStart(k.padding, "0") : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/kelompok" className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-accent [&_svg]:size-4">
          <ArrowLeft />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Kelompok</h1>
          <p className="text-sm text-muted-foreground">
            {k.nama} · {kegiatan ? `${kuponCount ?? 0} kupon ${kegiatan.nama} (${assignedCount ?? 0} terpakai) · ` : ""}{pesertaCount ?? 0} anggota
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Kelompok</CardTitle>
          <CardDescription>
            {kegiatan ? (
              <>
                Ubah nama, prefix, dan range nomor untuk <b>{kegiatan.nama}</b>. Menambah range akan generate kupon baru;
                mengecilkan range hanya boleh jika kupon yang dibuang masih <b>tersedia</b> (belum dipakai/ditukar).
                Kupon kegiatan lain tidak tersentuh.
              </>
            ) : (
              "Tidak ada kegiatan berjalan yang memakai kupon — perubahan range hanya disimpan sebagai nilai awal, tanpa membuat kupon."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditKelompokForm kelompok={{ id: k.id, nama: k.nama, prefixDefault, startDefault, endDefault }} />
        </CardContent>
      </Card>
    </div>
  );
}
