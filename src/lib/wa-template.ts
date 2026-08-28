import { APP_TIME_ZONE, formatRupiah } from "@/lib/utils";
import { terbilang } from "@/lib/terbilang";

export interface WaTemplateInput {
  nomor: string;
  nama: string;
  alamat: string;
  nominal_donasi: number | string;
  tanggal: string;
  /** Hanya dipakai pesan manual (wa.me). Template resmi Meta tidak mengirim jumlah kupon. */
  total_kupon?: number;
}

/**
 * Rapikan nilai variabel template Meta.
 *
 * Meta MENOLAK pesannya (bukan sekadar merapikan) bila nilai variabel memuat
 * baris baru, tab, atau lebih dari empat spasi berturut-turut. Alamat hasil
 * impor Excel sering membawa baris baru, jadi setiap nilai wajib lewat sini.
 */
export function sanitizeWaParam(raw: string | number | null | undefined): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Nominal untuk variabel {{2}}: TANPA awalan "Rp" — template Meta sudah
 * menuliskannya sendiri. Mis. "500.000 (Lima ratus ribu rupiah)".
 */
export function formatNominalTemplate(nominal: number | string | null | undefined): string {
  const n = Number(String(nominal ?? "").replace(/[^\d]/g, "")) || 0;
  const angka = n.toLocaleString("id-ID");
  const kata = terbilang(n);
  return kata ? `${angka} (${kata.charAt(0).toUpperCase()}${kata.slice(1)} rupiah)` : angka;
}

/**
 * Bungkus nilai dengan penanda tebal WhatsApp.
 *
 * PERCOBAAN. Cara resmi menebalkan variabel adalah menulis `*{{1}}*` di body
 * template Meta, bukan di sini. Membungkusnya dari sisi pemanggil biasanya
 * ikut tampil tebal karena aplikasi WhatsApp memformat teks akhir setelah
 * variabel disisipkan, tetapi Meta tidak menjaminnya. Bila yang muncul justru
 * bintang mentah, cukup buang pemanggilan `tebal()` di `buildTemplateParams`.
 *
 * Penanda tebal WhatsApp hanya berlaku bila menempel pada karakter bukan
 * spasi, jadi bungkus SETELAH `sanitizeWaParam` yang sudah memangkas ujungnya.
 */
function tebal(nilai: string): string {
  // Bintang yang sudah ada di dalam nilai akan mengacaukan pasangan penanda.
  const bersih = nilai.replace(/\*/g, "").trim();
  return bersih ? `*${bersih}*` : "";
}

/**
 * Lima nilai variabel template `tanda_terima_hut_kwan_kong_2026`, urut {{1}}..{{5}}.
 *
 * Untuk menebalkan sebagian saja, buang `tebal()` pada baris yang tidak perlu.
 */
export function buildTemplateParams(input: WaTemplateInput): string[] {
  return [
    tebal(sanitizeWaParam(input.nomor)),
    tebal(sanitizeWaParam(formatNominalTemplate(input.nominal_donasi))),
    tebal(sanitizeWaParam(input.nama)),
    tebal(sanitizeWaParam(input.alamat)),
    tebal(sanitizeWaParam(input.tanggal)),
  ];
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

Total kupon diberikan : ${input.total_kupon ?? 0} kupon
${SEP}

Tanggal : ${input.tanggal}
${SEP}

Terima kasih.`;
}

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function partsWITA(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { day: Number(map.day), month: Number(map.month), year: Number(map.year) };
}

/** Format tanggal Indonesia (WITA), mis. "30 Juni 2026". Default ke hari ini bila kosong. */
export function formatTanggalIndo(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const { day, month, year } = partsWITA(d);
  return `${day} ${BULAN[month - 1]} ${year}`;
}

/** Format nomor tanda terima, mis. 123 -> "0123/TT/2026". Tahun mengikuti WITA. */
export function formatNomorTT(n: number | null | undefined, iso?: string | null): string {
  if (!n || n <= 0) return "-";
  const d = iso ? new Date(iso) : new Date();
  const { year } = partsWITA(d);
  return `${String(n).padStart(4, "0")}/TT/${year}`;
}

/**
 * Ubah nomor apa pun menjadi bentuk kirim `62xxxxxxxxxx`, atau `null` bila
 * nomornya BUKAN nomor seluler Indonesia yang masuk akal.
 *
 * Versi sebelumnya cuma membuang karakter non-digit lalu meloloskan sisanya,
 * jadi `"0"`, `"887791"`, dan `"0811410385 0411 3616870"` (dua nomor tercampur
 * dalam satu kolom) semuanya lolos ke API — selalu gagal, selalu masuk log,
 * dan selalu ikut terangkut tiap kali antrean diulang. Di data produksi pola
 * ini menyangkut ratusan baris, jadi penyaringnya dipindah ke sini agar satu
 * definisi "nomor sah" berlaku untuk pengiriman, tautan wa.me, maupun
 * penandaan massal di halaman Log WhatsApp.
 *
 * Aturannya: setelah awalan negara/nol dilepas, sisanya harus mulai dengan 8
 * dan panjangnya 9–12 digit (08xx-xxx-xxx terpendek sampai 08xx-xxxx-xxxx-xx
 * terpanjang). Nomor rumah (0411…) dan nomor luar negeri sengaja ditolak:
 * templat tanda terimanya berbahasa Indonesia dan ditujukan ke seluler.
 */
export function normalizeWaNumber(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  let nasional: string;
  if (digits.startsWith("62")) nasional = digits.slice(2);
  else if (digits.startsWith("0")) nasional = digits.slice(1);
  else if (digits.startsWith("8")) nasional = digits;
  else return null;

  if (!nasional.startsWith("8")) return null;
  if (nasional.length < 9 || nasional.length > 12) return null;

  return "62" + nasional;
}
