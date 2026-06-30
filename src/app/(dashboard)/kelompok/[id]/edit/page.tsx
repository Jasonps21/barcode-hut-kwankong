import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const k = data as { id: string; nama: string; prefix: string; range_start: number; range_end: number; padding: number };

  const [{ count: kuponCount }, { count: assignedCount }, { count: pesertaCount }] = await Promise.all([
    admin.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", id),
    admin.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", id).neq("status", "available"),
    admin.from("peserta").select("id", { count: "exact", head: true }).eq("kelompok_id", id),
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
            {k.nama} · {kuponCount ?? 0} kupon ({assignedCount ?? 0} terpakai) · {pesertaCount ?? 0} peserta
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Kelompok</CardTitle>
          <CardDescription>
            Ubah nama, prefix, dan range nomor. Menambah range akan generate kupon baru; mengecilkan range hanya boleh
            jika kupon yang dibuang masih <b>tersedia</b> (belum dipakai/ditukar).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditKelompokForm kelompok={{ id: k.id, nama: k.nama, prefixDefault, startDefault, endDefault }} />
        </CardContent>
      </Card>
    </div>
  );
}
