import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { getKegiatanAktif } from "@/lib/kegiatan";
import { KelompokForm } from "./kelompok-form";
import { deleteKelompokAction } from "./actions";

/** UUID nol: dipakai saat tidak ada kegiatan berkupon supaya query kosong, bukan error. */
const TANPA_KEGIATAN = "00000000-0000-0000-0000-000000000000";

interface Row {
  id: string; nama: string;
  /** Rentang kupon buku ini di kegiatan berjalan; null bila belum ada. */
  range: { prefix: string; range_start: number; range_end: number; padding: number } | null;
}

export default async function KelompokPage(props: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const supabase = await createClient();
  const kegiatan = await getKegiatanAktif();
  const kegiatanKupon = kegiatan?.pakai_kupon ? kegiatan : null;

  const [{ data }, { data: rangeData }] = await Promise.all([
    supabase.from("kelompok").select("id, nama").order("created_at", { ascending: true }),
    supabase
      .from("kegiatan_kupon_range")
      .select("kelompok_id, prefix, range_start, range_end, padding")
      .eq("kegiatan_id", kegiatanKupon?.id ?? TANPA_KEGIATAN),
  ]);
  const rangeMap = new Map(
    ((rangeData ?? []) as Array<{ kelompok_id: string; prefix: string; range_start: number; range_end: number; padding: number }>)
      .map((r) => [r.kelompok_id, r]),
  );
  const rows: Row[] = ((data ?? []) as Array<{ id: string; nama: string }>).map((k) => ({
    ...k,
    range: rangeMap.get(k.id) ?? null,
  }));

  // Pakai satu client & jalankan semua count paralel (hindari bikin client per baris).
  // Kupon dihitung untuk kegiatan berjalan; "terpakai" (penentu boleh hapus)
  // dihitung lintas kegiatan dari anggota & setoran.
  const counts = await Promise.all(
    rows.map(async (k) => {
      const kupon = (status?: string) => {
        let q = supabase.from("kupon").select("id", { count: "exact", head: true })
          .eq("kelompok_id", k.id)
          .eq("kegiatan_id", kegiatanKupon?.id ?? TANPA_KEGIATAN);
        if (status) q = q.eq("status", status);
        return q;
      };
      const [tot, asg, red, ang, don] = await Promise.all([
        kupon(), kupon("assigned"), kupon("redeemed"),
        supabase.from("anggota").select("id", { count: "exact", head: true }).eq("buku_id", k.id),
        supabase.from("donasi").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id),
      ]);
      return {
        id: k.id, total: tot.count ?? 0, assigned: asg.count ?? 0, redeemed: red.count ?? 0,
        peserta: ang.count ?? 0, setoran: don.count ?? 0,
      };
    }),
  );
  const countMap = new Map(counts.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kelompok</h1>
        <p className="text-sm text-muted-foreground">
          Kelompok = buku penagihan, tetap sama di semua kegiatan.{" "}
          {kegiatanKupon
            ? `Rentang & jumlah kupon di bawah milik kegiatan ${kegiatanKupon.nama}.`
            : "Tidak ada kegiatan berjalan yang memakai kupon, jadi kupon tidak dikelola saat ini."}
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.error}</div>
      )}
      {sp.deleted && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">Kelompok berhasil dihapus.</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tambah Kelompok Baru</CardTitle>
          <CardDescription>
            {kegiatanKupon
              ? `Master kupon untuk ${kegiatanKupon.nama} digenerate otomatis dari format range.`
              : "Kupon tidak digenerate karena kegiatan berjalan tidak memakai kupon."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KelompokForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Kelompok</CardTitle>
          <CardDescription>{rows.length} kelompok terdaftar.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Range</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Diasosiasikan</TableHead>
                <TableHead className="text-right">Ditukar</TableHead>
                <TableHead className="text-right">Anggota</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada kelompok.</TableCell>
                </TableRow>
              )}
              {rows.map((k) => {
                const c = countMap.get(k.id);
                const r = k.range;
                // Boleh dihapus selama belum dipakai: tak ada anggota, setoran,
                // & kupon yang sudah di-assign/ditukar. Kupon "available" yang
                // belum terpakai akan ikut terhapus. Server memeriksa ulang
                // lintas kegiatan.
                const inUse = (c?.peserta ?? 0) + (c?.setoran ?? 0) + (c?.assigned ?? 0) + (c?.redeemed ?? 0);
                const canDelete = inUse === 0;
                return (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.nama}</TableCell>
                    <TableCell>
                      {r ? (
                        <Badge variant="outline" className="font-mono">
                          {r.prefix}{String(r.range_start).padStart(r.padding, "0")} – {r.prefix}{String(r.range_end).padStart(r.padding, "0")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Belum ada rentang</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{c?.total ?? 0}</TableCell>
                    <TableCell className="text-right">{c?.assigned ?? 0}</TableCell>
                    <TableCell className="text-right">{c?.redeemed ?? 0}</TableCell>
                    <TableCell className="text-right">{c?.peserta ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/kelompok/${k.id}/edit`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-3.5"
                        >
                          <Pencil /> Edit
                        </Link>
                        {canDelete ? (
                          <form action={deleteKelompokAction}>
                            <input type="hidden" name="kelompok_id" value={k.id} />
                            <ConfirmButton
                              type="submit"
                              variant="outline"
                              size="sm"
                              message={`Hapus kelompok "${k.nama}" beserta ${c?.total ?? 0} kupon master yang belum terpakai? Tindakan ini tidak bisa dibatalkan.`}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 /> Hapus
                            </ConfirmButton>
                          </form>
                        ) : (
                          <span
                            title="Tidak bisa dihapus: sudah ada anggota, setoran, atau kupon yang dipakai/ditukar."
                            className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-muted-foreground opacity-60 [&_svg]:size-3.5"
                          >
                            <Trash2 /> Terpakai
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
