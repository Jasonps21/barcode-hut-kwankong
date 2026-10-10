export type Role = "admin" | "petugas_pendaftaran" | "petugas_distribusi";
export type WaStatus = "pending" | "sent" | "failed" | "not_sent";
export type KuponStatus = "available" | "assigned" | "redeemed";
export type MetodeBayar = "cash" | "transfer";

export interface Kelompok {
  id: string;
  nama: string;
  prefix: string;
  range_start: number;
  range_end: number;
  padding: number;
  created_at: string;
}

export interface JenisUsaha {
  id: string;
  nama: string;
  created_at: string;
}

export interface Profile {
  id: string;
  nama: string;
  role: Role;
  kelompok_id: string | null;
  can_edit_peserta: boolean;
  can_delete_peserta: boolean;
  created_at: string;
}

export interface Peserta {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  pinyin: string | null;
  alamat: string;
  no_whatsapp: string;
  nominal_donasi: number;
  metode_bayar: MetodeBayar | null;
  bukti_transfer_path: string | null;
  registered_at: string | null;
  nomor_tt: number | null;
  kelompok_id: string;
  kota_kabupaten: string | null;
  provinsi: string | null;
  jenis_usaha_id: string | null;
  keterangan: string | null;
  wa_status: WaStatus;
  wa_sent_at: string | null;
  wa_attempt_count: number;
  /** true = jangan pernah kirimi WA. Cron dan antre-ulang melewatinya. */
  wa_dikecualikan: boolean;
  /** Alasan pengecualian; berawalan "Otomatis:" bila disetel sistem. */
  wa_alasan_kecuali: string | null;
  created_at: string;
  created_by: string | null;
}

export interface WaLog {
  id: string;
  peserta_id: string | null;
  status: "sent" | "failed";
  fonnte_response: unknown;
  error_message: string | null;
  sent_at: string;
}

export interface ErrorLog {
  id: string;
  source: "server" | "client";
  message: string;
  stack: string | null;
  digest: string | null;
  url: string | null;
  user_id: string | null;
  user_agent: string | null;
  context: unknown;
  created_at: string;
}

export interface LogAktivitas {
  id: string;
  user_id: string | null;
  aksi: string;
  tabel_terkait: string | null;
  record_id: string | null;
  detail: unknown;
  created_at: string;
}

export interface Kupon {
  id: string;
  nomor_kupon: string;
  kelompok_id: string;
  status: KuponStatus;
  peserta_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  /** Kegiatan pemilik kupon — nomor kupon hanya unik di dalam satu kegiatan. */
  kegiatan_id: string | null;
  /** Donasi yang membuat kupon ini diberikan. Menggantikan peran `peserta_id`. */
  donasi_id: string | null;
}

// ===================== MULTI-KEGIATAN =====================
// `peserta` dulu menyatukan identitas + acara + satu setoran dalam satu baris.
// Tiga hal itu sekarang terpisah: Anggota (siapa), Kegiatan (acara apa), dan
// Donasi (setoran mana) — sehingga satu orang bisa menyetor berkali-kali dan
// riwayatnya nyambung antar kegiatan.

export interface Kegiatan {
  id: string;
  nama: string;
  tahun: number | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  /** Hanya satu kegiatan boleh aktif — dikunci lewat unique index di database. */
  aktif: boolean;
  /** Counter nomor tanda terima, berjalan sendiri per kegiatan. */
  tt_terakhir: number;
  /** false = kegiatan pencatatan saja; donasinya tidak memakai kupon. */
  pakai_kupon: boolean;
  keterangan: string | null;
  created_at: string;
}

export interface Anggota {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  pinyin: string | null;
  alamat: string | null;
  no_whatsapp: string | null;
  kota_kabupaten: string | null;
  provinsi: string | null;
  jenis_usaha_id: string | null;
  keterangan: string | null;
  /** Buku penagihan SAAT INI. Berubah kalau anggota dipindah buku. */
  buku_id: string | null;
  aktif: boolean;
  /** Menempel di anggota, bukan di donasi — yang bermasalah adalah nomornya. */
  wa_dikecualikan: boolean;
  wa_alasan_kecuali: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Donasi {
  id: string;
  anggota_id: string;
  kegiatan_id: string;
  /**
   * Buku pada SAAT transaksi terjadi (disalin, bukan di-join ke anggota).
   * Kalau anggota pindah buku, rekap setoran lama tidak ikut berubah.
   */
  kelompok_id: string;
  nominal: number;
  metode_bayar: MetodeBayar;
  bukti_transfer_path: string | null;
  tanggal: string;
  nomor_tt: number | null;
  wa_status: WaStatus;
  wa_sent_at: string | null;
  wa_attempt_count: number;
  keterangan: string | null;
  peserta_id_lama: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AnggotaBukuRiwayat {
  id: string;
  anggota_id: string;
  dari_buku_id: string | null;
  ke_buku_id: string;
  alasan: string | null;
  dipindah_oleh: string | null;
  created_at: string;
}

export interface KegiatanKuponRange {
  id: string;
  kegiatan_id: string;
  kelompok_id: string;
  prefix: string;
  range_start: number;
  range_end: number;
  padding: number;
  created_at: string;
}
