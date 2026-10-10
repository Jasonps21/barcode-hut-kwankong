"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasScanAccess, getKonterLabel } from "@/lib/scan-auth";

/** Jendela waktu tombol "Batalkan" di layar konter. Penukaran yang lebih tua
 *  dari ini hanya boleh dibuka admin, supaya salah tekan yang baru saja terjadi
 *  bisa diperbaiki sendiri tanpa membuka celah untuk membatalkan data lama. */
const BATAS_BATAL_MS = 2 * 60 * 1000;

export interface KuponRingkas {
  id: string;
  nomor_kupon: string;
}

export interface LookupResult {
  status:
    | "ok"
    | "wrong_group"
    | "already_redeemed"
    | "not_assigned"
    | "not_found";
  nomor_kupon: string;
  kupon_id?: string;
  kelompok_nama?: string;
  peserta?: { id: string; nama: string; alamat: string; no_whatsapp: string };
  redeemed_at?: string;
  /** Kupon peserta ini yang masih boleh ditukar, termasuk yang barusan discan.
   *  Ditampilkan sebagai daftar centang — tapi hanya yang benar-benar discan
   *  yang tercentang, sehingga kupon yang tidak dibawa tetap aman. */
  sisa?: KuponRingkas[];
  /** Ringkasan "x dari y" untuk panitia. */
  total_kupon?: number;
  sudah_ditukar?: number;
}

export interface RedeemResult {
  ok: boolean;
  berhasil: KuponRingkas[];
  gagal: { nomor_kupon: string; alasan: string }[];
  error?: string;
}

/**
 * Kegiatan yang kuponnya sedang ditukar di konter: kegiatan berjalan.
 *
 * Nomor kupon hanya unik di dalam satu kegiatan (A0001 boleh muncul lagi di
 * acara berikutnya), jadi setiap pencarian wajib dibatasi ke sini. Memakai
 * admin client karena konter masuk lewat PIN, bukan sesi login Supabase.
 */
async function kegiatanKonter(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await admin.from("kegiatan").select("id").eq("aktif", true).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function lookupKupon(nomorKupon: string): Promise<LookupResult> {
  if (!(await hasScanAccess())) redirect("/scan");
  const v = nomorKupon.trim().toUpperCase();
  if (!v) return { status: "not_found", nomor_kupon: v };

  const admin = createAdminClient();
  const kegiatanId = await kegiatanKonter(admin);
  if (!kegiatanId) return { status: "not_found", nomor_kupon: v };

  const { data } = await admin
    .from("kupon")
    .select("id, status, kelompok_id, redeemed_at, kelompok(nama), donasi(anggota(id, nama, alamat, no_whatsapp))")
    .eq("kegiatan_id", kegiatanId)
    .eq("nomor_kupon", v)
    .maybeSingle();

  if (!data) return { status: "not_found", nomor_kupon: v };
  const raw = data as unknown as {
    id: string;
    status: string;
    kelompok_id: string;
    redeemed_at: string | null;
    kelompok: { nama: string } | null;
    donasi: { anggota: { id: string; nama: string; alamat: string | null; no_whatsapp: string | null } | null } | null;
  };
  const a = raw.donasi?.anggota ?? null;
  // Layar konter memakai bentuk lama `peserta`; isinya kini anggota pemilik setoran.
  const k = {
    ...raw,
    peserta: a ? { id: a.id, nama: a.nama, alamat: a.alamat ?? "", no_whatsapp: a.no_whatsapp ?? "" } : null,
  };

  // Tanpa pemilik tidak ada daftar kupon lain yang bisa ditampilkan.
  if (!k.peserta) {
    return {
      status: k.status === "redeemed" ? "already_redeemed" : "not_assigned",
      nomor_kupon: v,
      kupon_id: k.id,
      kelompok_nama: k.kelompok?.nama,
      redeemed_at: k.redeemed_at ?? undefined,
    };
  }

  // Ambil seluruh kupon anggota ini DI KEGIATAN INI sekali jalan (bisa dari
  // beberapa setoran), lalu pilah di memori: satu query sudah cukup untuk
  // daftar sisa sekaligus ringkasan "x dari y".
  const { data: setoran } = await admin
    .from("donasi")
    .select("id")
    .eq("anggota_id", k.peserta.id)
    .eq("kegiatan_id", kegiatanId);
  const donasiIds = ((setoran ?? []) as { id: string }[]).map((d) => d.id);
  const { data: milik } = await admin
    .from("kupon")
    .select("id, nomor_kupon, status")
    .in("donasi_id", donasiIds.length ? donasiIds : ["00000000-0000-0000-0000-000000000000"])
    .order("nomor_kupon");

  const semua = (milik ?? []) as { id: string; nomor_kupon: string; status: string }[];
  const sisa = semua
    .filter((x) => x.status === "assigned")
    .map(({ id, nomor_kupon }) => ({ id, nomor_kupon }));

  const base = {
    nomor_kupon: v,
    kupon_id: k.id,
    kelompok_nama: k.kelompok?.nama,
    peserta: k.peserta,
    sisa,
    total_kupon: semua.length,
    sudah_ditukar: semua.filter((x) => x.status === "redeemed").length,
  };

  if (k.status === "redeemed") {
    return { ...base, status: "already_redeemed", redeemed_at: k.redeemed_at ?? undefined };
  }
  if (k.status !== "assigned") return { ...base, status: "not_assigned" };
  return { ...base, status: "ok" };
}

/**
 * Menukar beberapa kupon sekaligus dalam satu perjalanan ke server.
 *
 * Kupon yang gagal tidak membatalkan yang lain: panitia dapat laporan per kupon
 * dan sisanya tetap `assigned`, jadi peserta bisa menukarkannya lain waktu.
 */
export async function redeemKupons(kuponIds: string[]): Promise<RedeemResult> {
  if (!(await hasScanAccess())) redirect("/scan");
  const ids = [...new Set(kuponIds.filter(Boolean))];
  if (!ids.length) {
    return { ok: false, berhasil: [], gagal: [], error: "Belum ada kupon yang discan." };
  }

  const admin = createAdminClient();

  // Satu UPDATE kondisional untuk semua kupon sekaligus. Postgres hanya
  // menyentuh baris yang masih "assigned", jadi kupon yang keburu ditukar konter
  // lain tersaring dengan sendirinya tanpa perlu SELECT pengecekan lebih dulu —
  // celah antara baca dan tulis itulah yang dulu meloloskan penukaran ganda.
  // `.select()` wajib: tanpanya PostgREST membalas 204 tanpa error walau 0 baris
  // yang berubah, sehingga kegagalan tak bisa dibedakan dari keberhasilan.
  const { data: updated, error } = await admin
    .from("kupon")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "assigned")
    .select("id, nomor_kupon");
  if (error) return { ok: false, berhasil: [], gagal: [], error: error.message };

  const berhasil = (updated ?? []) as KuponRingkas[];
  const menang = new Set(berhasil.map((k) => k.id));
  const kalah = ids.filter((id) => !menang.has(id));

  const gagal: { nomor_kupon: string; alasan: string }[] = [];
  if (kalah.length) {
    const { data: cek } = await admin
      .from("kupon")
      .select("id, nomor_kupon, status")
      .in("id", kalah);
    const rows = (cek ?? []) as { id: string; nomor_kupon: string; status: string }[];
    for (const r of rows) {
      gagal.push({
        nomor_kupon: r.nomor_kupon,
        alasan: r.status === "redeemed" ? "sudah ditukar konter lain" : "belum diasosiasikan ke peserta",
      });
    }
    const hilang = kalah.length - rows.length;
    if (hilang > 0) gagal.push({ nomor_kupon: `${hilang} kupon`, alasan: "tidak ditemukan" });
  }

  if (berhasil.length) {
    // Satu baris log per kupon (sama seperti sebelumnya, supaya perhitungan yang
    // sudah ada tetap cocok), dengan konter & ukuran batch untuk telusur sengketa.
    const konter = await getKonterLabel();
    await admin.from("log_aktivitas").insert(
      berhasil.map((k) => ({
        aksi: "redeem_kupon",
        tabel_terkait: "kupon",
        record_id: k.id,
        detail: { nomor_kupon: k.nomor_kupon, konter, batch: berhasil.length },
      })),
    );
    revalidatePath("/dashboard");
    revalidatePath("/scan");
  }

  return { ok: berhasil.length > 0, berhasil, gagal };
}

/**
 * Membatalkan penukaran yang baru saja dilakukan (tombol "Batalkan" di konter).
 * Hanya menyentuh kupon yang ditukar dalam {@link BATAS_BATAL_MS} terakhir.
 */
export async function batalkanRedeem(
  kuponIds: string[],
): Promise<{ ok: boolean; jumlah: number; error?: string }> {
  if (!(await hasScanAccess())) redirect("/scan");
  const ids = [...new Set(kuponIds.filter(Boolean))];
  if (!ids.length) return { ok: false, jumlah: 0, error: "Tidak ada kupon untuk dibatalkan." };

  const admin = createAdminClient();
  const batas = new Date(Date.now() - BATAS_BATAL_MS).toISOString();

  const { data, error } = await admin
    .from("kupon")
    .update({ status: "assigned", redeemed_at: null })
    .in("id", ids)
    .eq("status", "redeemed")
    .gte("redeemed_at", batas)
    .select("id, nomor_kupon");
  if (error) return { ok: false, jumlah: 0, error: error.message };

  const dibatalkan = (data ?? []) as KuponRingkas[];
  if (!dibatalkan.length) {
    return { ok: false, jumlah: 0, error: "Sudah lewat batas waktu pembatalan. Hubungi admin." };
  }

  const konter = await getKonterLabel();
  await admin.from("log_aktivitas").insert(
    dibatalkan.map((k) => ({
      aksi: "batal_redeem_kupon",
      tabel_terkait: "kupon",
      record_id: k.id,
      detail: { nomor_kupon: k.nomor_kupon, konter },
    })),
  );

  revalidatePath("/dashboard");
  revalidatePath("/scan");
  return { ok: true, jumlah: dibatalkan.length };
}
