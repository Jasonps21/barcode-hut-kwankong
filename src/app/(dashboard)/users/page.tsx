import { Check, Trash2, X } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { UserForm } from "./user-form";
import { deleteUserAction, setUserPermissionAction } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  petugas_pendaftaran: "Petugas Pendaftaran",
  petugas_distribusi: "Petugas Distribusi",
};

interface ProfileRow {
  id: string; nama: string; role: string;
  kelompok_id: string | null;
  can_edit_peserta: boolean;
  can_delete_peserta: boolean;
  kelompok: { nama: string } | null;
}

/** Tombol toggle izin: klik untuk membalik nilai (server action). */
function PermToggle({ userId, perm, value, label }: { userId: string; perm: "edit" | "delete"; value: boolean; label: string }) {
  return (
    <form action={setUserPermissionAction}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="perm" value={perm} />
      <input type="hidden" name="value" value={String(!value)} />
      <button
        type="submit"
        title={value ? `Klik untuk mencabut izin ${label}` : `Klik untuk memberi izin ${label}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors [&_svg]:size-3.5",
          value
            ? "border-transparent bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
            : "bg-background text-muted-foreground hover:bg-accent",
        )}
      >
        {value ? <Check /> : <X />} {label}
      </button>
    </form>
  );
}

export default async function UsersPage() {
  const me = await requireProfile(["admin"]);
  const admin = createAdminClient();

  const [{ data: profiles }, { data: kelompokList }, { data: usersData }] = await Promise.all([
    admin.from("profiles").select("id, nama, role, kelompok_id, can_edit_peserta, can_delete_peserta, kelompok(nama)").order("created_at"),
    admin.from("kelompok").select("id, nama").order("nama"),
    admin.auth.admin.listUsers(),
  ]);

  const emailById = new Map(
    (usersData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );
  const rows = ((profiles ?? []) as unknown as ProfileRow[]).map((p) => ({
    ...p,
    email: emailById.get(p.id) ?? "",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengguna</h1>
        <p className="text-sm text-muted-foreground">Kelola akun admin dan petugas.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tambah Pengguna Baru</CardTitle>
          <CardDescription>Akun otomatis dikonfirmasi & langsung bisa login.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm kelompokOptions={(kelompokList ?? []) as Array<{ id: string; nama: string }>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Pengguna ({rows.length})</CardTitle>
          <CardDescription>Anda tidak bisa menghapus akun sendiri.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead>Izin Peserta</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada user.</TableCell></TableRow>
              )}
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.nama}
                    {u.id === me.id && <Badge variant="outline" className="ml-2">Anda</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{u.kelompok?.nama ?? "—"}</TableCell>
                  <TableCell>
                    {u.role === "admin" ? (
                      <span className="text-xs text-muted-foreground">Akses penuh</span>
                    ) : u.role === "petugas_pendaftaran" ? (
                      <div className="flex flex-wrap gap-1.5">
                        <PermToggle userId={u.id} perm="edit" value={u.can_edit_peserta} label="Edit" />
                        <PermToggle userId={u.id} perm="delete" value={u.can_delete_peserta} label="Hapus" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== me.id && (
                      <form action={deleteUserAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <Button type="submit" variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">
                          <Trash2 /> Hapus
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
