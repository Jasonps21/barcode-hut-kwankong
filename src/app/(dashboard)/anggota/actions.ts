"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, canEditPeserta } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getKegiatanAktif } from "@/lib/kegiatan";
import { catatDonasi, tanggalSetor } from "@/lib/donasi";
import { hanziToPinyin } from "@/lib/pinyin";
import { sanitizeWaParam } from "@/lib/wa-template";
import { PREFIX_ALASAN_OTOMATIS } from "@/lib/whatsapp";
import type { Kegiatan } from "@/types/database";

export type AksiState = { error?: string; success?: string } | undefined;

type AdminClient = ReturnType<typeof createAdminClient>;

interface AnggotaRingkas {
  id: string;
  nama: string;
  alamat: string | null;
  no_whatsapp: string | null;
  buku_id: string | null;
}

/**
 * Petugas hanya boleh menyentuh anggota di bukunya sendiri; admin bebas.
 * Dipakai sebelum setiap perubahan agar pengecekan tidak tercecer.
 */
async function ambilAnggotaBerizin(
  admin: AdminClient,
  anggotaId: string,
  profile: { role: string; kelompok_id: string | null },
): Promise<{ anggota: AnggotaRingkas } | { error: string }> {
  const { data } = await admin
    .from("anggota")
    .select("id, nama, alamat, no_whatsapp, buku_id")
    .eq("id", anggotaId)
    .single();
  if (!data) return { error: "Anggota tidak ditemukan." };

  const anggota = data as AnggotaRingkas;
  if (profile.role !== "admin" && anggota.buku_id !== profile.kelompok_id) {
    return { error: "Anggota ini bukan milik buku Anda." };
  }
  return { anggota };
}

/** Kegiatan dari form, atau kegiatan yang sedang berjalan bila tidak dipilih. */
async function ambilKegiatan(admin: AdminClient, kegiatanId: string): Promise<Kegiatan | { error: string }> {
  if (kegiatanId) {
    const { data } = await admin.from("kegiatan").select("*").eq("id", kegiatanId).maybeSingle();
    return (data as Kegiatan) ?? { error: "Kegiatan yang dipilih tidak ditemukan." };
  }
  const aktif = await getKegiatanAktif();
  return aktif ?? { error: "Belum ada kegiatan yang aktif. Admin perlu mengaktifkan kegiatan dulu di halaman Kegiatan." };
}

interface NomorUsahaInput {
  label?: string;
  nomor?: string;
  samaWa?: boolean;
}

/** Ganti seluruh nomor usaha milik anggota sesuai isian form (hapus lalu insert ulang). */
async function syncNomorUsaha(
  admin: AdminClient,
  anggotaId: string,
  noWhatsapp: string,
  rowsJson: string,
): Promise<void> {
  let raw: NomorUsahaInput[] = [];
  try {
    const parsed = JSON.parse(rowsJson);
    if (Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = [];
  }

  const rows = raw
    .map((r, i) => ({
      anggota_id: anggotaId,
      label: String(r.label ?? "").trim() || null,
      nomor: r.samaWa ? noWhatsapp.trim() : String(r.nomor ?? "").trim(),
      sama_dengan_wa: !!r.samaWa,
      urutan: i,
    }))
    .filter((r) => r.nomor);

  await admin.from("anggota_nomor_usaha").delete().eq("anggota_id", anggotaId);
  if (rows.length) {
    await admin.from("anggota_nomor_usaha").insert(rows);
  }
}

/** Dipanggil langsung dari combobox creatable saat user mengetik kategori jenis usaha baru. */
export async function createJenisUsahaAction(
  nama: string,
): Promise<{ id: string; nama: string } | { error: string }> {
  await requireProfile(["admin", "petugas_pendaftaran"]);
  const trimmed = nama.trim();
  if (!trimmed) return { error: "Nama jenis usaha wajib diisi." };

  const admin = createAdminClient();

  // Cegah duplikat/typo: cek dulu case-insensitive sebelum insert baru.
  const { data: existing } = await admin
    .from("jenis_usaha")
    .select("id, nama")
    .ilike("nama", trimmed)
    .maybeSingle();
  if (existing) return existing as { id: string; nama: string };

  const { data, error } = await admin
    .from("jenis_usaha")
    .insert({ nama: trimmed })
    .select("id, nama")
    .single();
  if (error || !data) return { error: `Gagal tambah jenis usaha: ${error?.message ?? "unknown"}` };

  revalidatePath("/anggota/tambah");
  return data as { id: string; nama: string };
}

/** Field identitas anggota yang sama antara form tambah & edit. */
function bacaIdentitas(formData: FormData) {
  const nama_hanzi = String(formData.get("nama_hanzi") ?? "").trim();
  return {
    nama: String(formData.get("nama") ?? "").trim(),
    nama_hanzi: nama_hanzi || null,
    // Pinyin selalu dihitung ulang di server dari Hanzi agar konsisten.
    pinyin: nama_hanzi ? hanziToPinyin(nama_hanzi) || null : null,
    alamat: sanitizeWaParam(String(formData.get("alamat") ?? "")) || null,
    no_whatsapp: String(formData.get("no_whatsapp") ?? "").trim() || null,
    kota_kabupaten: String(formData.get("kota_kabupaten") ?? "").trim() || null,
    provinsi: String(formData.get("provinsi") ?? "").trim() || null,
    jenis_usaha_id: String(formData.get("jenis_usaha_id") ?? "").trim() || null,
    keterangan: String(formData.get("keterangan") ?? "").trim() || null,
  };
}

/**
 * Daftarkan anggota BARU, opsional sekaligus dengan setoran pertamanya.
 *
 * Anggota adalah master permanen: boleh dibuat tanpa setoran (mis. didata
 * dulu, ditagih kemudian). Bila nominal diisi, setorannya dicatat lewat jalur
 * yang sama dengan halaman anggota.
 */
export async function createAnggotaAction(
  _prev: AksiState,
  formData: FormData,
): Promise<AksiState> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const admin = createAdminClient();

  const identitas = bacaIdentitas(formData);
  const nomorUsahaJson = String(formData.get("nomor_usaha_json") ?? "[]");
  const bukuInput = String(formData.get("buku_id") ?? "").trim();

  const nominal = Number(String(formData.get("nominal") ?? "").replace(/\D/g, ""));
  const adaDonasi = Number.isFinite(nominal) && nominal > 0;
  const metodeBayar = String(formData.get("metode_bayar") ?? "").trim();
  const buktiFile = formData.get("bukti") as File | null;
  const kuponList = formData
    .getAll("kupon")
    .map((v) => String(v).trim().toUpperCase())
    .filter(Boolean);

  if (!identitas.nama) return { error: "Nama wajib diisi." };
  if (!identitas.alamat) return { error: "Alamat wajib diisi." };

  // Admin memilih buku; petugas selalu masuk ke bukunya sendiri.
  const bukuId = profile.role === "admin" ? bukuInput : profile.kelompok_id;
  if (!bukuId) {
    return {
      error: profile.role === "admin" ? "Buku wajib dipilih." : "Akun Anda belum terhubung ke buku.",
    };
  }

  let kegiatan: Kegiatan | null = null;
  if (adaDonasi) {
    if (metodeBayar !== "cash" && metodeBayar !== "transfer") {
      return { error: "Metode bayar wajib dipilih (cash/transfer)." };
    }
    if (metodeBayar === "transfer" && !(buktiFile && buktiFile.size > 0)) {
      return { error: "Bukti transfer wajib diupload — foto belum diupload." };
    }
    const k = await ambilKegiatan(admin, String(formData.get("kegiatan_id") ?? "").trim());
    if ("error" in k) return k;
    kegiatan = k;
  } else if (kuponList.length) {
    return { error: "Kupon hanya bisa diberikan bersama setoran. Isi nominal donasinya." };
  }

  const { data: anggotaData, error: aErr } = await admin
    .from("anggota")
    .insert({ ...identitas, buku_id: bukuId, created_by: profile.id })
    .select("id, nama, alamat, no_whatsapp, buku_id")
    .single();
  if (aErr || !anggotaData) return { error: `Gagal simpan anggota: ${aErr?.message ?? "unknown"}` };
  const anggota = anggotaData as AnggotaRingkas;

  await syncNomorUsaha(admin, anggota.id, identitas.no_whatsapp ?? "", nomorUsahaJson);

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "buat_anggota",
    tabel_terkait: "anggota",
    record_id: anggota.id,
    detail: { nama: anggota.nama },
  });

  revalidatePath("/anggota");

  if (!kegiatan) {
    return { success: `Anggota "${anggota.nama}" tersimpan tanpa setoran.` };
  }

  const hasil = await catatDonasi(admin, profile, {
    anggota,
    kegiatan,
    kelompokId: bukuId,
    nominal,
    metodeBayar: metodeBayar as "cash" | "transfer",
    tanggal: tanggalSetor(String(formData.get("tanggal") ?? "").trim()),
    keterangan: null,
    bukti: buktiFile,
    kupon: kuponList,
  });

  if (!hasil.ok) {
    // Anggotanya tetap disimpan: identitas yang sudah diketik tidak perlu
    // diulang, setorannya bisa dicatat lagi dari halaman anggota.
    return { error: `Anggota "${anggota.nama}" tersimpan, tapi setorannya gagal: ${hasil.error} Catat ulang setorannya dari halaman anggota.` };
  }

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "tambah_donasi",
    tabel_terkait: "donasi",
    record_id: hasil.donasiId,
    detail: { anggota: anggota.nama, kegiatan: kegiatan.nama, nominal, kupons: kuponList },
  });

  revalidatePath("/transaksi");
  revalidatePath("/dashboard");
  return {
    success:
      `Anggota "${anggota.nama}" tersimpan dengan setoran ${new Intl.NumberFormat("id-ID").format(nominal)}` +
      (hasil.jumlahKupon ? ` dan ${hasil.jumlahKupon} kupon` : "") +
      ".",
  };
}

/** Ubah identitas anggota. Setoran tidak ikut berubah — itu wewenang halaman Transaksi. */
export async function updateAnggotaAction(
  _prev: AksiState,
  formData: FormData,
): Promise<AksiState> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) return { error: "Anda tidak memiliki izin untuk mengubah data anggota." };

  const admin = createAdminClient();
  const id = String(formData.get("anggota_id") ?? "").trim();
  const identitas = bacaIdentitas(formData);
  const nomorUsahaJson = String(formData.get("nomor_usaha_json") ?? "[]");

  if (!id) return { error: "Anggota tidak valid." };
  if (!identitas.nama) return { error: "Nama wajib diisi." };
  if (!identitas.alamat) return { error: "Alamat wajib diisi." };

  const izin = await ambilAnggotaBerizin(admin, id, profile);
  if ("error" in izin) return izin;

  const { error } = await admin.from("anggota").update(identitas).eq("id", id);
  if (error) return { error: `Gagal simpan: ${error.message}` };

  await syncNomorUsaha(admin, id, identitas.no_whatsapp ?? "", nomorUsahaJson);

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "ubah_anggota",
    tabel_terkait: "anggota",
    record_id: id,
    detail: { nama: identitas.nama },
  });

  revalidatePath("/anggota");
  revalidatePath(`/anggota/${id}`);
  return { success: "Data anggota diperbarui." };
}

/**
 * Catat satu setoran baru untuk anggota.
 *
 * Inilah jawaban atas "sudah menyumbang, lalu ingin menyumbang lagi": tidak
 * ada pembatasan satu-donasi-per-orang lagi. Tiap setoran jadi baris sendiri,
 * lengkap dengan tanggal, nomor tanda terima, bukti, dan kuponnya masing-masing.
 */
export async function tambahDonasiAction(
  _prev: AksiState,
  formData: FormData,
): Promise<AksiState> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const admin = createAdminClient();

  const anggotaId = String(formData.get("anggota_id") ?? "").trim();
  const nominal = Number(String(formData.get("nominal") ?? "").replace(/\D/g, ""));
  const metodeBayar = String(formData.get("metode_bayar") ?? "").trim();
  const keterangan = String(formData.get("keterangan") ?? "").trim();
  const buktiFile = formData.get("bukti") as File | null;
  const kuponList = formData
    .getAll("kupon")
    .map((v) => String(v).trim().toUpperCase())
    .filter(Boolean);

  if (!anggotaId) return { error: "Anggota tidak valid." };
  if (!Number.isFinite(nominal) || nominal <= 0) return { error: "Nominal donasi tidak valid." };
  if (metodeBayar !== "cash" && metodeBayar !== "transfer") {
    return { error: "Metode bayar wajib dipilih (cash/transfer)." };
  }
  if (metodeBayar === "transfer" && !(buktiFile && buktiFile.size > 0)) {
    return { error: "Bukti transfer wajib diupload — foto belum diupload." };
  }

  // Kegiatan dipilih di form supaya sumbangan untuk kegiatan yang sudah lewat
  // juga bisa dicatat. Tanpa pilihan, jatuh ke kegiatan yang sedang berjalan.
  const kegiatan = await ambilKegiatan(admin, String(formData.get("kegiatan_id") ?? "").trim());
  if ("error" in kegiatan) return kegiatan;

  const izin = await ambilAnggotaBerizin(admin, anggotaId, profile);
  if ("error" in izin) return izin;
  const { anggota } = izin;

  // Petugas sering mendapat nomor baru saat menagih. Nomor itu disimpan ke
  // anggota sebelum setoran dicatat supaya tanda terima terkirim ke nomor
  // yang benar. Pengecualian otomatis karena nomor rusak ikut dilepas — yang
  // rusak sudah diganti; pengecualian yang disetel admin tetap dihormati.
  const waBaru = String(formData.get("no_whatsapp_baru") ?? "").trim();
  if (waBaru && waBaru !== (anggota.no_whatsapp ?? "")) {
    const { data: lama } = await admin
      .from("anggota")
      .select("wa_alasan_kecuali")
      .eq("id", anggotaId)
      .single();
    const otomatis = ((lama as { wa_alasan_kecuali: string | null } | null)?.wa_alasan_kecuali ?? "")
      .startsWith(PREFIX_ALASAN_OTOMATIS);
    await admin
      .from("anggota")
      .update(otomatis
        ? { no_whatsapp: waBaru, wa_dikecualikan: false, wa_alasan_kecuali: null }
        : { no_whatsapp: waBaru })
      .eq("id", anggotaId);
    anggota.no_whatsapp = waBaru;
  }

  // Buku dicatat sebagai salinan pada baris donasi. Kalau anggota pindah buku
  // nanti, setoran ini tetap terhitung di buku yang menagihnya hari ini.
  const kelompokId = anggota.buku_id ?? profile.kelompok_id;
  if (!kelompokId) {
    return { error: "Anggota ini belum punya buku. Tentukan bukunya dulu lewat tombol Pindah Buku." };
  }

  const hasil = await catatDonasi(admin, profile, {
    anggota,
    kegiatan,
    kelompokId,
    nominal,
    metodeBayar,
    tanggal: tanggalSetor(String(formData.get("tanggal") ?? "").trim()),
    keterangan: keterangan || null,
    bukti: buktiFile,
    kupon: kuponList,
  });
  if (!hasil.ok) return { error: hasil.error };

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "tambah_donasi",
    tabel_terkait: "donasi",
    record_id: hasil.donasiId,
    detail: { anggota: anggota.nama, kegiatan: kegiatan.nama, nominal, kupons: kuponList },
  });

  revalidatePath(`/anggota/${anggotaId}`);
  revalidatePath("/anggota");
  revalidatePath("/kegiatan");
  revalidatePath("/transaksi");
  revalidatePath("/dashboard");

  return {
    success:
      `Donasi ${new Intl.NumberFormat("id-ID").format(nominal)} untuk ${anggota.nama} tersimpan di ${kegiatan.nama}` +
      (hasil.nomorTT ? ` (No. TT ${hasil.nomorTT})` : "") +
      (hasil.jumlahKupon ? ` dengan ${hasil.jumlahKupon} kupon` : "") +
      ".",
  };
}

/**
 * Pindahkan anggota dari satu buku ke buku lain.
 *
 * Yang berpindah HANYA buku penagihan ke depan. Baris donasi lama sengaja
 * tidak disentuh — kalau ikut dipindah, rekap setoran petugas buku lama akan
 * berubah surut dan laporan yang sudah dicetak jadi tidak cocok.
 *
 * Admin saja: kalau petugas boleh memindah sendiri, anggota bisa saling
 * direbut antar buku.
 */
export async function pindahBukuAction(
  _prev: AksiState,
  formData: FormData,
): Promise<AksiState> {
  const profile = await requireProfile(["admin"]);
  const admin = createAdminClient();

  const anggotaIds = formData.getAll("anggota_id").map((v) => String(v).trim()).filter(Boolean);
  const keBukuId = String(formData.get("ke_buku_id") ?? "").trim();
  const alasan = String(formData.get("alasan") ?? "").trim();

  if (anggotaIds.length === 0) return { error: "Belum ada anggota yang dipilih." };
  if (!keBukuId) return { error: "Buku tujuan wajib dipilih." };

  const { data: buku } = await admin.from("kelompok").select("id, nama").eq("id", keBukuId).single();
  if (!buku) return { error: "Buku tujuan tidak ditemukan." };

  const { data: daftar } = await admin
    .from("anggota")
    .select("id, nama, alamat, no_whatsapp, buku_id")
    .in("id", anggotaIds);
  const anggotaList = (daftar ?? []) as AnggotaRingkas[];
  if (anggotaList.length === 0) return { error: "Anggota tidak ditemukan." };

  const perluPindah = anggotaList.filter((a) => a.buku_id !== keBukuId);
  if (perluPindah.length === 0) {
    return { error: `Semua anggota yang dipilih sudah ada di ${(buku as { nama: string }).nama}.` };
  }

  // Riwayat dicatat lebih dulu, selagi buku asal masih diketahui.
  const { error: rErr } = await admin.from("anggota_buku_riwayat").insert(
    perluPindah.map((a) => ({
      anggota_id: a.id,
      dari_buku_id: a.buku_id,
      ke_buku_id: keBukuId,
      alasan: alasan || null,
      dipindah_oleh: profile.id,
    })),
  );
  if (rErr) return { error: `Gagal mencatat riwayat pindah buku: ${rErr.message}` };

  const { error: uErr } = await admin
    .from("anggota")
    .update({ buku_id: keBukuId })
    .in("id", perluPindah.map((a) => a.id));
  if (uErr) return { error: `Gagal memindahkan anggota: ${uErr.message}` };

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "pindah_buku",
    tabel_terkait: "anggota",
    record_id: perluPindah.length === 1 ? perluPindah[0].id : null,
    detail: {
      ke_buku: (buku as { nama: string }).nama,
      jumlah: perluPindah.length,
      anggota: perluPindah.map((a) => a.nama),
      alasan: alasan || null,
    },
  });

  revalidatePath("/anggota");
  for (const a of perluPindah) revalidatePath(`/anggota/${a.id}`);

  return {
    success:
      perluPindah.length === 1
        ? `${perluPindah[0].nama} dipindahkan ke ${(buku as { nama: string }).nama}. Riwayat donasi lamanya tetap tercatat di buku sebelumnya.`
        : `${perluPindah.length} anggota dipindahkan ke ${(buku as { nama: string }).nama}. Riwayat donasi lama tetap di buku masing-masing.`,
  };
}
