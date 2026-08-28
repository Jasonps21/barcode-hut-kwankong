"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWaNumber } from "@/lib/wa-template";
import { tandaiNomorTidakValid, PREFIX_ALASAN_OTOMATIS } from "@/lib/whatsapp";

/** Batas atas satu kali antre, sekadar rem kalau formnya diisi ngawur. */
const MAKS_SEKALI = 2000;

function segarkanHalaman(): void {
  revalidatePath("/wa-log");
  revalidatePath("/peserta");
  revalidatePath("/transaksi");
  revalidatePath("/dashboard");
}

/**
 * Antrekan ulang peserta yang DIPILIH admin lewat centang di halaman Log
 * WhatsApp.
 *
 * Sengaja TIDAK mengirim apa pun. Barisnya cuma dikembalikan ke `pending`
 * dengan klaim dilepas, lalu cron `/api/cron/send-wa` yang mengirimnya
 * bertahap — lengkap dengan batas 200 per 24 jam bergulir, jeda antar pesan,
 * dan penjaga anti-kirim-ganda. Jadi tidak ada jalur blast kedua yang harus
 * ikut dipelihara, dan status per peserta tetap tercatat satu per satu.
 *
 * Tiga penjaga dijalankan ulang di server, karena daftar id datang dari
 * formulir dan tidak boleh dipercaya begitu saja:
 *
 *   1. `wa_status = 'sent'` ditolak — sudah terkirim, mengulang berarti
 *      donatur menerima dua tanda terima bernomor sama dan biayanya terbuang.
 *   2. `wa_dikecualikan` ditolak — inilah gunanya tanda itu.
 *   3. Nomor yang tidak lolos `normalizeWaNumber` ditolak dan sekalian
 *      ditandai, supaya tidak muncul lagi di pilihan berikutnya.
 */
export async function antreUlangTerpilihAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);

  const dipilih = formData
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, MAKS_SEKALI);
  if (!dipilih.length) return;

  const admin = createAdminClient();

  const { data } = await admin
    .from("peserta")
    .select("id, no_whatsapp, wa_status, wa_dikecualikan, registered_at")
    .in("id", dipilih);

  const rows = (data ?? []) as Array<{
    id: string;
    no_whatsapp: string | null;
    wa_status: string | null;
    wa_dikecualikan: boolean | null;
    registered_at: string | null;
  }>;

  const layak: string[] = [];
  const nomorRusak: string[] = [];

  for (const r of rows) {
    if (r.wa_status === "sent") continue;
    if (r.wa_dikecualikan) continue;
    if (!r.registered_at) continue;
    if (!normalizeWaNumber(r.no_whatsapp ?? "")) {
      nomorRusak.push(r.id);
      continue;
    }
    layak.push(r.id);
  }

  if (nomorRusak.length) {
    await admin
      .from("peserta")
      .update({
        wa_dikecualikan: true,
        wa_alasan_kecuali: `${PREFIX_ALASAN_OTOMATIS} nomor WhatsApp tidak valid`,
      })
      .in("id", nomorRusak);
  }

  if (layak.length) {
    await admin
      .from("peserta")
      .update({ wa_status: "pending", wa_attempt_count: 0 })
      .in("id", layak);
  }

  segarkanHalaman();
}

/**
 * Inti dari dua aksi massal di bawah.
 *
 * Arahnya (`jadikan`) sengaja datang dari aksi yang dipanggil, BUKAN dari
 * nilai tombol submit. Satu formulir di halaman Log WhatsApp punya beberapa
 * tombol, dan kalau arahnya dititipkan lewat `name`/`value` tombol, satu
 * kegagalan serialisasi berarti "batalkan pengecualian" justru mengecualikan.
 * Dua fungsi terpisah membuat arah yang salah mustahil terjadi.
 */
async function setKecualikanMassal(formData: FormData, jadikan: boolean): Promise<void> {
  const profile = await requireProfile(["admin"]);

  const ids = formData
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, MAKS_SEKALI);
  if (!ids.length) return;

  const admin = createAdminClient();

  await admin
    .from("peserta")
    .update(
      jadikan
        ? { wa_dikecualikan: true, wa_alasan_kecuali: "Disetel admin" }
        : { wa_dikecualikan: false, wa_alasan_kecuali: null },
    )
    .in("id", ids);

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: jadikan ? "kecualikan_wa_massal" : "batal_kecualikan_wa_massal",
    tabel_terkait: "peserta",
    record_id: null,
    detail: { jumlah: ids.length },
  });

  segarkanHalaman();
}

/**
 * Tandai peserta yang dicentang sebagai "jangan kirim".
 *
 * Berbagi kotak centang yang sama dengan `antreUlangTerpilihAction` — dua
 * tombol submit pada satu formulir. Admin memilih sekali, lalu memutuskan
 * hendak mengantre atau justru menyingkirkan. Tanpa ini, mengecualikan 400
 * nomor rusak berarti 400 klik.
 */
export async function kecualikanTerpilihAction(formData: FormData): Promise<void> {
  await setKecualikanMassal(formData, true);
}

/**
 * Lepas tanda "jangan kirim" dari peserta yang dicentang.
 *
 * Sengaja TIDAK ikut mengantrekan. Membuka blokir dan mengirim adalah dua
 * keputusan berbeda, dan menggabungkannya berarti satu klik bisa memicu
 * pengiriman berbiaya yang tidak diniatkan.
 */
export async function batalKecualikanTerpilihAction(formData: FormData): Promise<void> {
  await setKecualikanMassal(formData, false);
}

/**
 * Setel atau lepas tanda "jangan kirim" untuk satu peserta.
 *
 * Melepas tanda TIDAK ikut mengantrekan — admin masih harus memilihnya secara
 * sadar. Memisahkan keduanya mencegah satu klik "buka blokir" berubah menjadi
 * pengiriman yang tidak diniatkan.
 */
export async function toggleKecualikanAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin"]);

  const id = String(formData.get("peserta_id") ?? "").trim();
  const jadikan = String(formData.get("jadikan") ?? "") === "1";
  if (!id) return;

  const alasanInput = String(formData.get("alasan") ?? "").trim();
  const admin = createAdminClient();

  await admin
    .from("peserta")
    .update(
      jadikan
        ? { wa_dikecualikan: true, wa_alasan_kecuali: alasanInput || "Disetel admin" }
        : { wa_dikecualikan: false, wa_alasan_kecuali: null },
    )
    .eq("id", id);

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: jadikan ? "kecualikan_wa" : "batal_kecualikan_wa",
    tabel_terkait: "peserta",
    record_id: id,
    detail: { alasan: alasanInput || null },
  });

  segarkanHalaman();
}

/**
 * Sapu sekali jalan: tandai semua peserta yang nomornya tidak bisa dipakai.
 *
 * Data lama menyimpan ratusan nomor kosong, nomor sepotong, dan dua nomor
 * tercampur dalam satu kolom. Tanpa ini admin harus menunggu cron menemukannya
 * satu per satu, sementara baris-baris itu terus memenuhi daftar "gagal".
 */
export async function tandaiNomorInvalidAction(): Promise<void> {
  await requireProfile(["admin"]);
  await tandaiNomorTidakValid();
  segarkanHalaman();
}
