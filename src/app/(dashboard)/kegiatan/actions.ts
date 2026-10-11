"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type KegiatanState = { error?: string; success?: string } | undefined;

export async function buatKegiatanAction(
  _prev: KegiatanState,
  formData: FormData,
): Promise<KegiatanState> {
  const profile = await requireProfile(["admin"]);
  const admin = createAdminClient();

  const nama = String(formData.get("nama") ?? "").trim();
  const tahunRaw = String(formData.get("tahun") ?? "").trim();
  const tanggalMulai = String(formData.get("tanggal_mulai") ?? "").trim();
  const keterangan = String(formData.get("keterangan") ?? "").trim();
  const pakaiKupon = formData.get("pakai_kupon") === "on";

  if (!nama) return { error: "Nama kegiatan wajib diisi." };

  const tahun = tahunRaw ? Number(tahunRaw) : null;
  if (tahunRaw && (!Number.isInteger(tahun) || tahun! < 2000 || tahun! > 2100)) {
    return { error: "Tahun tidak valid." };
  }

  const { data: kembar } = await admin
    .from("kegiatan")
    .select("id")
    .ilike("nama", nama)
    .maybeSingle();
  if (kembar) return { error: `Kegiatan "${nama}" sudah ada.` };

  const { error } = await admin.from("kegiatan").insert({
    nama,
    tahun,
    tanggal_mulai: tanggalMulai || null,
    keterangan: keterangan || null,
    pakai_kupon: pakaiKupon,
    // Sengaja tidak langsung aktif — pengaktifan adalah keputusan terpisah
    // karena mengalihkan tujuan semua input donasi baru.
    aktif: false,
  });
  if (error) return { error: `Gagal membuat kegiatan: ${error.message}` };

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "buat_kegiatan",
    tabel_terkait: "kegiatan",
    detail: { nama, tahun, pakai_kupon: pakaiKupon },
  });

  revalidatePath("/kegiatan");
  return {
    success: pakaiKupon
      ? `Kegiatan "${nama}" dibuat. Aktifkan bila sudah siap menerima donasi.`
      : `Kegiatan "${nama}" dibuat tanpa kupon. Aktifkan bila sudah siap menerima donasi.`,
  };
}

/**
 * Nyalakan/matikan kupon untuk satu kegiatan.
 *
 * Kupon yang sudah terbagi tidak disentuh — yang berubah hanya apakah form
 * donasi berikutnya meminta kupon.
 */
export async function ubahPakaiKuponAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin"]);
  const id = String(formData.get("kegiatan_id") ?? "").trim();
  const pakaiKupon = formData.get("pakai_kupon") === "true";
  if (!id) return;

  const admin = createAdminClient();
  const { data: kegiatan } = await admin.from("kegiatan").select("id, nama").eq("id", id).single();
  if (!kegiatan) return;

  await admin.from("kegiatan").update({ pakai_kupon: pakaiKupon }).eq("id", id);

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: pakaiKupon ? "kegiatan_kupon_nyala" : "kegiatan_kupon_mati",
    tabel_terkait: "kegiatan",
    record_id: id,
    detail: { nama: (kegiatan as { nama: string }).nama },
  });

  revalidatePath("/kegiatan");
  revalidatePath("/anggota", "layout");
}

/**
 * Jadikan satu kegiatan sebagai kegiatan berjalan.
 *
 * Database hanya mengizinkan satu baris aktif, jadi yang lama harus
 * dinonaktifkan lebih dulu — kalau dibalik urutannya, unique index menolak.
 */
export async function aktifkanKegiatanAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin"]);
  const id = String(formData.get("kegiatan_id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  const { data: kegiatan } = await admin.from("kegiatan").select("id, nama").eq("id", id).single();
  if (!kegiatan) return;

  await admin.from("kegiatan").update({ aktif: false }).eq("aktif", true);
  await admin.from("kegiatan").update({ aktif: true }).eq("id", id);

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "aktifkan_kegiatan",
    tabel_terkait: "kegiatan",
    record_id: id,
    detail: { nama: (kegiatan as { nama: string }).nama },
  });

  revalidatePath("/kegiatan");
  revalidatePath("/anggota");
  revalidatePath("/dashboard");
}
