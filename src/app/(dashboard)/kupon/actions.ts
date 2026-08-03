"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Membatalkan penukaran kupon dari sisi admin — tanpa batas waktu, berbeda dengan
 * tombol "Batalkan" di layar konter (BATAS_BATAL_MS di src/app/scan/actions.ts)
 * yang sengaja hanya berlaku 2 menit. Yang di konter untuk salah tekan yang baru
 * saja terjadi; yang ini untuk yang baru ketahuan belakangan, mis. sisa uji coba
 * sebelum acara.
 *
 * Sengaja tidak menyentuh assigned_at/peserta_id: yang dibatalkan hanya
 * penukarannya, bukan kepemilikan kupon oleh peserta.
 */
export async function resetRedeemKuponAction(formData: FormData): Promise<void> {
  // Halaman /kupon memang sudah admin-only, tapi server action bisa dipanggil
  // langsung lewat request buatan sendiri — jadi haknya dicek ulang di sini.
  const profile = await requireProfile(["admin"]);
  const kuponId = String(formData.get("kupon_id") ?? "").trim();
  if (!kuponId) return;

  const admin = createAdminClient();

  const { data: kupon } = await admin
    .from("kupon")
    .select("id, status, peserta_id")
    .eq("id", kuponId)
    .maybeSingle();
  if (!kupon) return;
  const k = kupon as { id: string; status: string; peserta_id: string | null };
  if (k.status !== "redeemed") return;

  // `.eq("status", "redeemed")` diulang di UPDATE, bukan cuma di cek di atas:
  // kalau ada admin lain (atau dobel-klik) yang keburu membatalkan baris yang
  // sama, UPDATE ini menyentuh 0 baris dan tidak menulis log ganda.
  const { data: updated } = await admin
    .from("kupon")
    .update({
      // Kupon tanpa peserta dikembalikan ke "available" supaya tidak lahir baris
      // "assigned" yang tidak dimiliki siapa pun.
      status: k.peserta_id ? "assigned" : "available",
      redeemed_at: null,
      redeemed_by: null,
    })
    .eq("id", k.id)
    .eq("status", "redeemed")
    .select("id, nomor_kupon")
    .maybeSingle();
  if (!updated) return;

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "batal_redeem_kupon",
    tabel_terkait: "kupon",
    record_id: k.id,
    detail: {
      nomor_kupon: (updated as { nomor_kupon: string }).nomor_kupon,
      oleh: profile.nama,
      via: "halaman Cek Kupon (admin)",
    },
  });

  revalidatePath("/kupon");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  revalidatePath("/kelompok");
}
