import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { KelompokForm } from "./kelompok-form";
import { deleteKelompokAction } from "./actions";

interface Row {
  id: string; nama: string; prefix: string;
  range_start: number; range_end: number; padding: number;
}

export default async function KelompokPage(props: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("kelompok")
    .select("id, nama, prefix, range_start, range_end, padding")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Row[];

  // Pakai satu client & jalankan semua count paralel (hindari bikin client per baris).
  const counts = await Promise.all(
    rows.map(async (k) => {
      const [tot, asg, red, pes] = await Promise.all([
        supabase.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id),
        supabase.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id).eq("status", "assigned"),
        supabase.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id).eq("status", "redeemed"),
        supabase.from("peserta").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id),
      ]);
      return { id: k.id, total: tot.count ?? 0, assigned: asg.count ?? 0, redeemed: red.count ?? 0, peserta: pes.count ?? 0 };
    }),
  );
  const countMap = new Map(counts.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kelompok</h1>
        <p className="text-sm text-muted-foreground">Kelola kelompok dan generate master kupon.</p>
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
          <CardDescription>Generate master kupon otomatis dari format range.</CardDescription>
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
                <TableHead className="text-right">Peserta</TableHead>
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
                const start = String(k.range_start).padStart(k.padding, "0");
                const end = String(k.range_end).padStart(k.padding, "0");
                // Boleh dihapus selama belum dipakai: tak ada peserta & tak ada
                // kupon yang sudah di-assign/ditukar. Kupon "available" yang belum
                // terpakai akan ikut terhapus.
                const inUse = (c?.peserta ?? 0) + (c?.assigned ?? 0) + (c?.redeemed ?? 0);
                const canDelete = inUse === 0;
                return (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.nama}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{k.prefix}{start} – {k.prefix}{end}</Badge></TableCell>
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
                            title="Tidak bisa dihapus: sudah ada peserta atau kupon yang dipakai/ditukar."
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
