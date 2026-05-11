import { Trash2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserForm } from "./user-form";
import { deleteUserAction } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  petugas_pendaftaran: "Petugas Pendaftaran",
  petugas_distribusi: "Petugas Distribusi",
};

interface ProfileRow {
  id: string; nama: string; role: string;
  kelompok_id: string | null;
  kelompok: { nama: string } | null;
}

export default async function UsersPage() {
  const me = await requireProfile(["admin"]);
  const admin = createAdminClient();

  const [{ data: profiles }, { data: kelompokList }, { data: usersData }] = await Promise.all([
    admin.from("profiles").select("id, nama, role, kelompok_id, kelompok(nama)").order("created_at"),
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
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Belum ada user.</TableCell></TableRow>
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
