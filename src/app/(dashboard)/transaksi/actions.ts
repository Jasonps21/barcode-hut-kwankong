"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile, canEditPeserta, canDeletePeserta } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBukti } from "@/lib/bukti";
import { tanggalSetor } from "@/lib/donasi";
import { sendDonasiWa, klaimKirimUlang } from "@/lib/whatsapp";
import { formatNomorTT, formatTanggalIndo } from "@/lib/wa-template";

export type DonasiState = { error?: string; success?: string } | undefined;

type AdminClient = ReturnType<typeof createAdminClient>;

interface DonasiRingkas {
  id: string;
  anggota_id: string;
  kegiatan_id: string;
  kelompok_id: string;
  nama: string;
  alamat: string | null;
  no_whatsapp: string | null;
  nominal_donasi: number | string;
  nomor_tt: number | null;
  registered_at: string;
}

/** Ambil satu donasi lewat view, sekaligus cek petugas hanya menyentuh bukunya sendiri. */
async function ambilDonasiBerizin(
  admin: AdminClient,
  donasiId: string,
  profile: { role: string; kelompok_id: string | null },
): Promise<DonasiRingkas | null> {
  const { data } = await admin
    .from("donasi_lengkap")
    .select("id, anggota_id, kegiatan_id, kelompok_id, nama, alamat, no_whatsapp, nominal_donasi, nomor_tt, registered_at")
    .eq("id", donasiId)
    .maybeSingle();
  if (!data) return null;
  const d = data as DonasiRingkas;
  if (profile.role !== "admin" && d.kelompok_id !== profile.kelompok_id) return null;
  return d;
}

function segarkan(donasi: { id: string; anggota_id: string }) {
  revalidatePath("/transaksi");
  revalidatePath(`/transaksi/${donasi.id}`);
  revalidatePath(`/anggota/${donasi.anggota_id}`);
  revalidatePath("/anggota");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
}

/** Kirim ulang tanda terima WA untuk satu setoran. */
export async function kirimUlangWaAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const donasiId = String(formData.get("donasi_id") ?? "");
  if (!donasiId) return;

  const admin = createAdminClient();
  const d = await ambilDonasiBerizin(admin, donasiId, profile);
  if (!d) return;

  const { count: totalKupon } = await admin
    .from("kupon")
    .select("id", { count: "exact", head: true })
    .eq("donasi_id", donasiId);

  // Setel ulang status DAN klaim barisnya sekaligus. Kalau dipisah — nol-kan
  // di sini, klaim menyusul di dalam `after()` — dua klik beruntun akan
  // mengirim dua pesan, karena klik kedua menol-kan klaim milik klik pertama
  // yang pengirimannya masih berjalan.
  if (!(await klaimKirimUlang(donasiId))) {
    revalidatePath("/transaksi");
    return;
  }

  let nomorTT = d.nomor_tt;
  if (!nomorTT) {
    const { data } = await admin.rpc("assign_nomor_tt_donasi", { p_donasi_id: donasiId });
    nomorTT = Number.isFinite(Number(data)) && Number(data) > 0 ? Number(data) : null;
  }

  after(async () => {
    await sendDonasiWa({
      donasiId,
      anggotaId: d.anggota_id,
      noWhatsapp: d.no_whatsapp ?? "",
      template: {
        nomor: formatNomorTT(nomorTT, d.registered_at),
        nama: d.nama,
        alamat: d.alamat ?? "",
        nominal_donasi: d.nominal_donasi,
        tanggal: formatTanggalIndo(d.registered_at),
        total_kupon: totalKupon ?? 0,
      },
      sudahDiklaim: true,
    });
  });

  revalidatePath("/transaksi");
}

/** Ubah nominal, metode, tanggal, keterangan, atau bukti satu setoran. Admin saja. */
export async function updateDonasiAction(
  _prev: DonasiState,
  formData: FormData,
): Promise<DonasiState> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) return { error: "Anda tidak memiliki izin untuk mengubah setoran." };

  const admin = createAdminClient();
  const id = String(formData.get("donasi_id") ?? "").trim();
  const nominal = Number(String(formData.get("nominal") ?? "").replace(/\D/g, ""));
  const metodeBayar = String(formData.get("metode_bayar") ?? "").trim();
  const keterangan = String(formData.get("keterangan") ?? "").trim();
  const tanggalRaw = String(formData.get("tanggal") ?? "").trim();
  const buktiFile = formData.get("bukti") as File | null;

  const d = await ambilDonasiBerizin(admin, id, profile);
  if (!d) return { error: "Setoran tidak ditemukan." };
  if (!Number.isFinite(nominal) || nominal <= 0) return { error: "Nominal donasi tidak valid." };
  if (metodeBayar !== "cash" && metodeBayar !== "transfer") {
    return { error: "Metode bayar wajib dipilih (cash/transfer)." };
  }

  const payload: Record<string, unknown> = {
    nominal,
    metode_bayar: metodeBayar,
    keterangan: keterangan || null,
  };
  if (tanggalRaw) payload.tanggal = tanggalSetor(tanggalRaw);

  if (buktiFile && buktiFile.size > 0) {
    try {
      const path = await uploadBukti(admin, id, buktiFile);
      if (path) payload.bukti_transfer_path = path;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Gagal upload bukti." };
    }
  }

  const { error } = await admin.from("donasi").update(payload).eq("id", id);
  if (error) return { error: `Gagal simpan: ${error.message}` };

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "ubah_donasi",
    tabel_terkait: "donasi",
    record_id: id,
    detail: { anggota: d.nama, nominal_lama: Number(d.nominal_donasi), nominal, metode_bayar: metodeBayar },
  });

  segarkan(d);
  return { success: "Setoran diperbarui." };
}

/**
 * Hapus satu setoran. Kupon yang belum ditukar dikembalikan ke status
 * tersedia; setoran yang kuponnya sudah ditukar tidak boleh dihapus karena
 * bingkisannya sudah keluar.
 */
export async function hapusDonasiAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canDeletePeserta(profile)) return;
  const id = String(formData.get("donasi_id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  const d = await ambilDonasiBerizin(admin, id, profile);
  if (!d) return;

  const { data: kupons } = await admin.from("kupon").select("id, status").eq("donasi_id", id);
  const list = (kupons ?? []) as Array<{ id: string; status: string }>;
  if (list.some((k) => k.status === "redeemed")) {
    redirect(`/transaksi/${id}?error=${encodeURIComponent("Setoran ini tidak bisa dihapus: ada kupon yang sudah ditukar.")}`);
  }
  if (list.length) {
    await admin
      .from("kupon")
      .update({ status: "available", donasi_id: null, assigned_at: null, assigned_by: null })
      .eq("donasi_id", id);
  }

  const { error } = await admin.from("donasi").delete().eq("id", id);
  if (error) {
    redirect(`/transaksi/${id}?error=${encodeURIComponent(`Gagal menghapus: ${error.message}`)}`);
  }

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "hapus_donasi",
    tabel_terkait: "donasi",
    record_id: id,
    detail: { anggota: d.nama, nominal: Number(d.nominal_donasi), nomor_tt: d.nomor_tt },
  });

  segarkan(d);
  redirect(`/anggota/${d.anggota_id}`);
}

/** Tambahkan satu kupon ke setoran yang sudah tercatat. */
export async function assignKuponDonasiAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) return;
  const donasiId = String(formData.get("donasi_id") ?? "").trim();
  const nomor = String(formData.get("nomor_kupon") ?? "").trim().toUpperCase();
  if (!donasiId || !nomor) return;

  const admin = createAdminClient();
  const d = await ambilDonasiBerizin(admin, donasiId, profile);
  if (!d) return;

  const balik = (pesan: string) => redirect(`/transaksi/${donasiId}?error=${encodeURIComponent(pesan)}`);

  // Nomor kupon hanya unik di dalam satu kegiatan, jadi pencarian wajib
  // dibatasi ke kegiatan setoran ini.
  const { data: kupon } = await admin
    .from("kupon")
    .select("id, status, kelompok_id")
    .eq("kegiatan_id", d.kegiatan_id)
    .eq("nomor_kupon", nomor)
    .maybeSingle();
  if (!kupon) balik(`Kupon ${nomor} tidak terdaftar di kegiatan setoran ini.`);
  const k = kupon as { id: string; status: string; kelompok_id: string };
  if (k.status !== "available") balik(`Kupon ${nomor} sudah dipakai atau ditukar.`);

  const { data: terupdate } = await admin
    .from("kupon")
    .update({ status: "assigned", donasi_id: donasiId, assigned_at: new Date().toISOString(), assigned_by: profile.id })
    .eq("id", k.id)
    .eq("status", "available")
    .select("id");
  if (!(terupdate ?? []).length) balik(`Kupon ${nomor} baru saja diambil petugas lain.`);

  segarkan(d);
}

/** Lepaskan satu kupon dari setoran (kembali tersedia). Kupon yang sudah ditukar tidak bisa dilepas. */
export async function lepasKuponDonasiAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) return;
  const donasiId = String(formData.get("donasi_id") ?? "").trim();
  const kuponId = String(formData.get("kupon_id") ?? "").trim();
  if (!donasiId || !kuponId) return;

  const admin = createAdminClient();
  const d = await ambilDonasiBerizin(admin, donasiId, profile);
  if (!d) return;

  await admin
    .from("kupon")
    .update({ status: "available", donasi_id: null, assigned_at: null, assigned_by: null })
    .eq("id", kuponId)
    .eq("donasi_id", donasiId)
    .eq("status", "assigned");

  segarkan(d);
}
