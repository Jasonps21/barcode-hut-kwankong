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
  wa_status: WaStatus;
  wa_sent_at: string | null;
  wa_attempt_count: number;
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
}
