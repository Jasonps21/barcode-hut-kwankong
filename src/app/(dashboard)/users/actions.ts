"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/types/database";

const ROLES: Role[] = ["admin", "petugas_pendaftaran", "petugas_distribusi"];

export type CreateUserState = { error?: string; success?: string } | undefined;

export async function createUserAction(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  await requireProfile(["admin"]);

  const nama = String(formData.get("nama") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const kelompokIdRaw = String(formData.get("kelompok_id") ?? "");
  const kelompok_id = kelompokIdRaw && kelompokIdRaw !== "none" ? kelompokIdRaw : null;

  if (!nama) return { error: "Nama wajib diisi." };
  if (!email || !email.includes("@")) return { error: "Email tidak valid." };
  if (password.length < 6) return { error: "Password minimal 6 karakter." };
  if (!ROLES.includes(role)) return { error: "Role tidak valid." };
  if (role === "petugas_pendaftaran" && !kelompok_id) {
    return { error: "Petugas pendaftaran wajib di-assign ke kelompok." };
  }

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama },
  });
  if (createErr || !created?.user) {
    return { error: `Gagal buat user: ${createErr?.message ?? "unknown"}` };
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id,
    nama,
    role,
    kelompok_id: role === "petugas_pendaftaran" ? kelompok_id : null,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Gagal simpan profile: ${profErr.message}` };
  }

  revalidatePath("/users");
  return { success: `User "${nama}" (${email}) berhasil dibuat.` };
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const me = await requireProfile(["admin"]);
  const userId = String(formData.get("user_id") ?? "");
  if (!userId || userId === me.id) return;

  const admin = createAdminClient();
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/users");
}

export async function setUserPermissionAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const perm = String(formData.get("perm") ?? "");
  const value = String(formData.get("value") ?? "") === "true";
  if (!userId || (perm !== "edit" && perm !== "delete")) return;

  const col = perm === "edit" ? "can_edit_peserta" : "can_delete_peserta";
  const admin = createAdminClient();
  await admin.from("profiles").update({ [col]: value }).eq("id", userId);
  revalidatePath("/users");
}

export async function updateUserRoleAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const kelompokIdRaw = String(formData.get("kelompok_id") ?? "");
  const kelompok_id = kelompokIdRaw && kelompokIdRaw !== "none" ? kelompokIdRaw : null;
  if (!userId || !ROLES.includes(role)) return;
  if (role === "petugas_pendaftaran" && !kelompok_id) return;

  const admin = createAdminClient();
  await admin.from("profiles").update({
    role,
    kelompok_id: role === "petugas_pendaftaran" ? kelompok_id : null,
  }).eq("id", userId);
  revalidatePath("/users");
}
