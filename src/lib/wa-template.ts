import { formatRupiah } from "@/lib/utils";
import { terbilang } from "@/lib/terbilang";

export interface WaTemplateInput {
  nomor: string;
  nama: string;
  alamat: string;
  nominal_donasi: number | string;
  tanggal: string;
}

const SEP = "..........................";

export function buildWaMessage(input: WaTemplateInput): string {
  const kegiatan = process.env.NEXT_PUBLIC_EVENT_NAME ?? "HUT Kwan Ping";
  const nominal = Number(String(input.nominal_donasi ?? "").replace(/[^\d]/g, "")) || 0;
  const kata = terbilang(nominal);
  const nominalText = kata
    ? `${formatRupiah(nominal)} (${kata.charAt(0).toUpperCase()}${kata.slice(1)} rupiah)`
    : formatRupiah(nominal);

  return `*TANDA TERIMA*

Nomor : ${input.nomor}
${SEP}

Telah diterima : ${nominalText}
${SEP}

Untuk kegiatan : ${kegiatan}
${SEP}

Dari : ${input.nama}
${SEP}

Alamat : ${input.alamat}
${SEP}

Tanggal : ${input.tanggal}
${SEP}

Terima kasih.`;
}

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Format tanggal Indonesia, mis. "30 Juni 2026". Default ke hari ini bila kosong. */
export function formatTanggalIndo(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format nomor tanda terima, mis. 123 -> "0123/TT/2026". */
export function formatNomorTT(n: number | null | undefined, iso?: string | null): string {
  if (!n || n <= 0) return "-";
  const year = (iso ? new Date(iso) : new Date()).getFullYear();
  return `${String(n).padStart(4, "0")}/TT/${year}`;
}

export function normalizeWaNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}
