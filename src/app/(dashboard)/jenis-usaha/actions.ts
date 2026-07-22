"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateJenisUsahaState = { error?: string; success?: string } | undefined;

export async function createJenisUsahaAction(
  _prev: CreateJenisUsahaState,
  formData: FormData,
): Promise<CreateJenisUsahaState> {
  await requireProfile(["admin"]);
  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) return { error: "Nama jenis usaha wajib diisi." };

  const admin = createAdminClient();
  const { error } = await admin.from("jenis_usaha").insert({ nama });
  if (error) {
    if (error.code === "23505") return { error: `Jenis usaha "${nama}" sudah ada.` };
    return { error: `Gagal menambah jenis usaha: ${error.message}` };
  }

  revalidatePath("/jenis-usaha");
  return { success: `Jenis usaha "${nama}" ditambahkan.` };
}

function backWith(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/jenis-usaha?${qs}`);
}

export async function updateJenisUsahaAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const id = String(formData.get("jenis_usaha_id") ?? "").trim();
  const nama = String(formData.get("nama") ?? "").trim();
  if (!id) return;
  if (!nama) backWith({ error: "Nama jenis usaha wajib diisi." });

  const admin = createAdminClient();
  const { error } = await admin.from("jenis_usaha").update({ nama }).eq("id", id);
  if (error) {
    if (error.code === "23505") backWith({ error: `Jenis usaha "${nama}" sudah ada.` });
    backWith({ error: `Gagal menyimpan: ${error.message}` });
  }

  revalidatePath("/jenis-usaha");
  revalidatePath("/cari-usaha");
  backWith({ updated: "1" });
}

export async function deleteJenisUsahaAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const id = String(formData.get("jenis_usaha_id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();

  const { count } = await admin
    .from("peserta")
    .select("id", { count: "exact", head: true })
    .eq("jenis_usaha_id", id);
  if ((count ?? 0) > 0) {
    backWith({ error: `Tidak bisa dihapus: masih dipakai oleh ${count} peserta.` });
  }

  const { error } = await admin.from("jenis_usaha").delete().eq("id", id);
  if (error) backWith({ error: `Gagal menghapus: ${error.message}` });

  revalidatePath("/jenis-usaha");
  revalidatePath("/cari-usaha");
  backWith({ deleted: "1" });
}
