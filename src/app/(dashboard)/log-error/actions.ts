"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function backWith(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/log-error?${qs}`);
}

export async function deleteErrorLogAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  const { error } = await admin.from("error_logs").delete().eq("id", id);
  if (error) backWith({ error: `Gagal hapus log: ${error.message}` });

  revalidatePath("/log-error");
  backWith({ deleted: "1" });
}

export async function clearAllErrorLogsAction(): Promise<void> {
  await requireProfile(["admin"]);
  const admin = createAdminClient();
  // Semua baris punya id (uuid), jadi neq id kosong = hapus semua.
  const { error } = await admin.from("error_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) backWith({ error: `Gagal hapus semua log: ${error.message}` });

  revalidatePath("/log-error");
  backWith({ deleted: "all" });
}
