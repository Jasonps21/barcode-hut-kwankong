import { Save, Trash2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { JenisUsahaForm } from "./jenis-usaha-form";
import { updateJenisUsahaAction, deleteJenisUsahaAction } from "./actions";

interface Row {
  id: string;
  nama: string;
}

export default async function JenisUsahaPage(props: {
  searchParams: Promise<{ error?: string; updated?: string; deleted?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const supabase = await createClient();

  const { data } = await supabase.from("jenis_usaha").select("id, nama").order("nama");
  const rows = (data ?? []) as Row[];

  const { data: pesertaData } = await supabase.from("peserta").select("jenis_usaha_id");
  const usageCount = new Map<string, number>();
  for (const p of (pesertaData ?? []) as Array<{ jenis_usaha_id: string | null }>) {
    if (p.jenis_usaha_id) usageCount.set(p.jenis_usaha_id, (usageCount.get(p.jenis_usaha_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Jenis Usaha</h1>
        <p className="text-sm text-muted-foreground">
          Kelola kategori jenis usaha peserta, dipakai di form peserta dan halaman pencarian publik /cari-usaha.
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.error}</div>
      )}
      {sp.updated && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">Jenis usaha berhasil diperbarui.</div>
      )}
      {sp.deleted && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">Jenis usaha berhasil dihapus.</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tambah Jenis Usaha Baru</CardTitle>
          <CardDescription>Nama harus unik, mis. &quot;Furniture&quot;, &quot;Electronic&quot;.</CardDescription>
        </CardHeader>
        <CardContent>
          <JenisUsahaForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Jenis Usaha</CardTitle>
          <CardDescription>{rows.length} jenis usaha terdaftar.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="text-right">Dipakai Peserta</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Belum ada jenis usaha.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const used = usageCount.get(r.id) ?? 0;
                const canDelete = used === 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <form action={updateJenisUsahaAction} className="flex items-center gap-2">
                        <input type="hidden" name="jenis_usaha_id" value={r.id} />
                        <Input name="nama" defaultValue={r.nama} className="h-8 w-full sm:w-56" required />
                        <button
                          type="submit"
                          title="Simpan perubahan nama"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-3.5"
                        >
                          <Save /> Simpan
                        </button>
                      </form>
                    </TableCell>
                    <TableCell className="text-right">{used}</TableCell>
                    <TableCell className="text-right">
                      {canDelete ? (
                        <form action={deleteJenisUsahaAction} className="inline">
                          <input type="hidden" name="jenis_usaha_id" value={r.id} />
                          <ConfirmButton
                            type="submit"
                            variant="outline"
                            size="sm"
                            message={`Hapus jenis usaha "${r.nama}"? Tindakan ini tidak bisa dibatalkan.`}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 /> Hapus
                          </ConfirmButton>
                        </form>
                      ) : (
                        <span
                          title={`Tidak bisa dihapus: masih dipakai oleh ${used} peserta.`}
                          className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-muted-foreground opacity-60 [&_svg]:size-3.5"
                        >
                          <Trash2 /> Terpakai
                        </span>
                      )}
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
