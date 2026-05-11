"use client";

import { useActionState, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createUserAction, type CreateUserState } from "./actions";

interface Props { kelompokOptions: Array<{ id: string; nama: string }> }

export function UserForm({ kelompokOptions }: Props) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(createUserAction, undefined);
  const [role, setRole] = useState("petugas_pendaftaran");
  const needsKelompok = role === "petugas_pendaftaran";

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama Lengkap</Label>
          <Input id="nama" name="nama" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="petugas@contoh.com" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="min 6 karakter" minLength={6} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="petugas_pendaftaran">Petugas Pendaftaran</option>
            <option value="petugas_distribusi">Petugas Distribusi</option>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="kelompok_id">Kelompok {needsKelompok ? "" : "(tidak diperlukan untuk role ini)"}</Label>
          <Select id="kelompok_id" name="kelompok_id" defaultValue="" disabled={!needsKelompok} required={needsKelompok}>
            <option value="" disabled>{needsKelompok ? "Pilih kelompok" : "—"}</option>
            <option value="none">— Tidak ada —</option>
            {kelompokOptions.map((k) => (
              <option key={k.id} value={k.id}>{k.nama}</option>
            ))}
          </Select>
        </div>
      </div>

      {state?.error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>}
      {state?.success && <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.success}</div>}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        {pending ? "Memproses..." : "Tambah User"}
      </Button>
    </form>
  );
}
