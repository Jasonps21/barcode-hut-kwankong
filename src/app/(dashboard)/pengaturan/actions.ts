"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { setScanPin } from "@/lib/scan-auth";

export type UpdateScanPinState = { error?: string; success?: string } | undefined;

export async function updateScanPinAction(_prev: UpdateScanPinState, formData: FormData): Promise<UpdateScanPinState> {
  const profile = await requireProfile(["admin"]);

  const pin = String(formData.get("pin") ?? "").trim();
  if (pin.length < 4) return { error: "PIN minimal 4 karakter." };

  const { error } = await setScanPin(pin, profile.id);
  if (error) return { error: `Gagal simpan PIN: ${error}` };

  revalidatePath("/pengaturan");
  return { success: "PIN halaman scan berhasil diubah." };
}
