import { formatRupiah } from "@/lib/utils";

export interface WaTemplateInput {
  nama: string;
  alamat: string;
  nominal_donasi: number | string;
  nomor_kupon_list: string[];
}

export function buildWaMessage(input: WaTemplateInput): string {
  const eventName = process.env.NEXT_PUBLIC_EVENT_NAME ?? "Kegiatan Donasi";
  const eventDate = process.env.NEXT_PUBLIC_EVENT_DATE ?? "(tanggal event)";
  const eventLocation = process.env.NEXT_PUBLIC_EVENT_LOCATION ?? "(lokasi event)";
  const adminPhone = process.env.NEXT_PUBLIC_ADMIN_PHONE ?? "(nomor panitia)";

  const listKupon = input.nomor_kupon_list.map((k) => `• ${k}`).join("\n");

  return `Assalamu'alaikum / Salam sejahtera Bapak/Ibu *${input.nama}*,

Terima kasih telah memberikan sumbangsih untuk kegiatan
*${eventName}*.

📋 *Detail Donasi Anda:*
• Nama: ${input.nama}
• Alamat: ${input.alamat}
• Total Donasi: ${formatRupiah(input.nominal_donasi)}

🎫 *Kupon Bingkisan (${input.nomor_kupon_list.length} kupon):*
${listKupon}

Kupon dapat ditukar dengan paket bingkisan pada
${eventDate} di ${eventLocation}.

Untuk pertanyaan, hubungi panitia di ${adminPhone}.

Hormat kami,
Panitia ${eventName}`;
}

export function normalizeWaNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}
