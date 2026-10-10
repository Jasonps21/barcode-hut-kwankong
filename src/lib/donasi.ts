import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBukti } from "@/lib/bukti";
import type { Kegiatan, Profile } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface InputDonasi {
  anggota: { id: string; nama: string; alamat: string | null; no_whatsapp: string | null };
  kegiatan: Kegiatan;
  /** Buku yang menagih setoran ini — disalin ke baris donasi (snapshot). */
  kelompokId: string;
  nominal: number;
  metodeBayar: "cash" | "transfer";
  tanggal: string;
  keterangan: string | null;
  bukti: File | null;
  kupon: string[];
}

export type HasilDonasi =
  | { ok: true; donasiId: string; nomorTT: number | null; jumlahKupon: number }
  | { ok: false; error: string };

/**
 * Satu-satunya jalur mencatat setoran: dipakai halaman anggota, form anggota
 * baru, dan layar Input Donasi. Menyatukannya di sini menjaga urutan yang
 * penting tetap sama di semua tempat:
 *
 *   1. kupon divalidasi SEBELUM donasi dibuat (tidak ada donasi menggantung),
 *   2. kupon diklaim dengan syarat `status = available` diulang di UPDATE
 *      (dua petugas tidak bisa merebut kupon yang sama),
 *   3. nomor tanda terima diambil dari counter kegiatan.
 *
 * Tanda terima WA TIDAK dikirim otomatis. Setoran disimpan berstatus
 * `not_sent` — di luar jangkauan cron, yang hanya mengambil `pending` — dan
 * dikirim manual lewat tombol "Kirim Ulang" di halaman Transaksi atau
 * diantrekan dari halaman Log WhatsApp bila memang diperlukan.
 */
export async function catatDonasi(
  admin: AdminClient,
  profile: Pick<Profile, "id" | "role" | "kelompok_id">,
  input: InputDonasi,
): Promise<HasilDonasi> {
  const { anggota, kegiatan, kelompokId, kupon: kuponList } = input;

  if (!kegiatan.pakai_kupon && kuponList.length) {
    return { ok: false, error: `Kegiatan ${kegiatan.nama} tidak memakai kupon. Kosongkan nomor kuponnya.` };
  }
  if (new Set(kuponList).size !== kuponList.length) {
    return { ok: false, error: "Ada nomor kupon duplikat." };
  }

  interface KuponRow { id: string; nomor_kupon: string; status: string; kelompok_id: string }
  let kupons: KuponRow[] = [];
  if (kuponList.length) {
    const { data, error } = await admin
      .from("kupon")
      .select("id, nomor_kupon, status, kelompok_id")
      .eq("kegiatan_id", kegiatan.id)
      .in("nomor_kupon", kuponList);
    if (error) return { ok: false, error: `Gagal cek kupon: ${error.message}` };

    kupons = (data ?? []) as KuponRow[];
    const ketemu = new Set(kupons.map((k) => k.nomor_kupon));
    const hilang = kuponList.filter((k) => !ketemu.has(k));
    if (hilang.length) {
      return { ok: false, error: `Kupon tidak terdaftar di kegiatan ${kegiatan.nama}: ${hilang.join(", ")}.` };
    }

    const terpakai = kupons.filter((k) => k.status !== "available");
    if (terpakai.length) {
      return { ok: false, error: `Kupon sudah dipakai/ditukar: ${terpakai.map((k) => k.nomor_kupon).join(", ")}.` };
    }

    const bukanBukuIni = kupons.filter((k) => k.kelompok_id !== kelompokId);
    if (bukanBukuIni.length && profile.role !== "admin") {
      return { ok: false, error: `Kupon bukan milik buku Anda: ${bukanBukuIni.map((k) => k.nomor_kupon).join(", ")}.` };
    }
  }

  const { data: donasiData, error: dErr } = await admin
    .from("donasi")
    .insert({
      anggota_id: anggota.id,
      kegiatan_id: kegiatan.id,
      kelompok_id: kelompokId,
      nominal: input.nominal,
      metode_bayar: input.metodeBayar,
      tanggal: input.tanggal,
      keterangan: input.keterangan,
      wa_status: "not_sent",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (dErr || !donasiData) return { ok: false, error: `Gagal simpan donasi: ${dErr?.message ?? "unknown"}` };

  const donasiId = (donasiData as { id: string }).id;

  if (input.bukti && input.bukti.size > 0) {
    try {
      const path = await uploadBukti(admin, donasiId, input.bukti);
      if (path) await admin.from("donasi").update({ bukti_transfer_path: path }).eq("id", donasiId);
    } catch (e) {
      await admin.from("donasi").delete().eq("id", donasiId);
      return { ok: false, error: e instanceof Error ? e.message : "Gagal upload bukti." };
    }
  }

  if (kupons.length) {
    const { data: terupdate, error: aErr } = await admin
      .from("kupon")
      .update({
        status: "assigned",
        donasi_id: donasiId,
        assigned_at: new Date().toISOString(),
        assigned_by: profile.id,
      })
      .in("id", kupons.map((k) => k.id))
      .eq("status", "available")
      .select("id");

    if (aErr || (terupdate ?? []).length !== kupons.length) {
      await admin
        .from("kupon")
        .update({ status: "available", donasi_id: null, assigned_at: null, assigned_by: null })
        .eq("donasi_id", donasiId);
      await admin.from("donasi").delete().eq("id", donasiId);
      return { ok: false, error: "Kupon baru saja diambil petugas lain. Coba ulangi dengan nomor kupon lain." };
    }
  }

  const { data: ttData } = await admin.rpc("assign_nomor_tt_donasi", { p_donasi_id: donasiId });
  const nomorTT = Number.isFinite(Number(ttData)) && Number(ttData) > 0 ? Number(ttData) : null;

  return { ok: true, donasiId, nomorTT, jumlahKupon: kupons.length };
}

/**
 * Ubah nilai tanggal dari <input type="date"> (YYYY-MM-DD, WITA) menjadi
 * timestamp. Tanggal hari ini memakai jam sekarang supaya urutan setoran
 * dalam satu hari tetap benar; tanggal lampau dipatok tengah hari WITA agar
 * tidak bergeser ke hari sebelumnya saat ditampilkan.
 */
export function tanggalSetor(raw: string): string {
  if (!raw) return new Date().toISOString();
  const hariIni = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (raw === hariIni) return new Date().toISOString();
  const d = new Date(`${raw}T12:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
