export type Role = "admin" | "petugas_pendaftaran" | "petugas_distribusi";
export type WaStatus = "pending" | "sent" | "failed" | "not_sent";
export type KuponStatus = "available" | "assigned" | "redeemed";

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
  created_at: string;
}

export interface Peserta {
  id: string;
  nama: string;
  alamat: string;
  no_whatsapp: string;
  nominal_donasi: number;
  kelompok_id: string;
  wa_status: WaStatus;
  wa_sent_at: string | null;
  wa_attempt_count: number;
  created_at: string;
  created_by: string | null;
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
