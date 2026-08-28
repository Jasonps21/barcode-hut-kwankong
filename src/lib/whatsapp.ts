import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildTemplateParams,
  normalizeWaNumber,
  formatNomorTT,
  formatTanggalIndo,
  type WaTemplateInput,
} from "@/lib/wa-template";

/**
 * Pengiriman tanda terima lewat API crm-wa (https://crm.byjason.dev), yang
 * berjalan di atas WhatsApp Business API resmi Meta.
 *
 * Meta hanya menerima TEMPLATE yang sudah disetujui untuk pesan yang dimulai
 * bisnis, jadi isi pesan tidak lagi disusun di sini — yang dikirim hanya nilai
 * kelima variabelnya (lihat `buildTemplateParams`).
 */

const BASE_URL = (process.env.CRM_WA_BASE_URL ?? "https://crm.byjason.dev").replace(/\/+$/, "");
const TEMPLATE = process.env.CRM_WA_TEMPLATE ?? "tanda_terima_hut_kwan_kong_2026";
const LANGUAGE = process.env.CRM_WA_LANGUAGE ?? "id";

/** Meta membatasi 250 percakapan/24 jam. Berhenti di 200 agar tersisa jatah blast manual. */
const BATAS_24JAM = Number(process.env.CRM_WA_BATAS_24JAM ?? 200);
const BATCH = Number(process.env.CRM_WA_BATCH ?? 25);
const DELAY_SECONDS = Number(process.env.CRM_WA_DELAY_SECONDS ?? 2);

const MAX_ATTEMPTS = 2;
// Serverless (Vercel) membatasi durasi fungsi. Retry harus singkat agar task
// `after()` tidak terbunuh sebelum selesai.
const RETRY_DELAY_MS = 3_000;

type AdminClient = ReturnType<typeof createAdminClient>;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

type Outcome =
  /** 2xx — terkirim. Jangan pernah kirim ulang. */
  | "sent"
  /** 4xx — permintaan salah. Mengulang tidak menolong. */
  | "failed"
  /** 429 — batas laju. Hentikan batch, sisanya tetap `pending`. */
  | "rate_limited"
  /** 5xx / gagal jaringan — gagal pasti, boleh dicoba ulang. */
  | "retryable";

interface CrmWaResult {
  outcome: Outcome;
  status: number;
  body: unknown;
  reason: string;
}

async function callCrmWa(phone: string, parameters: string[]): Promise<CrmWaResult> {
  const token = process.env.CRM_WA_TOKEN;
  if (!token) {
    const reason = "CRM_WA_TOKEN belum di-set";
    return { outcome: "failed", status: 0, body: { error: reason }, reason };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: phone,
        type: "template",
        template_name: TEMPLATE,
        language_code: LANGUAGE,
        parameters,
      }),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Gagal menghubungi crm-wa";
    return { outcome: "retryable", status: 0, body: { error: reason }, reason };
  }

  let body: unknown;
  try { body = await res.json(); } catch { body = { error: "non-json response" }; }

  const b = body as { message?: string; error?: string } | null;
  const reason = b?.message ?? b?.error ?? `HTTP ${res.status}`;

  // crm-wa sengaja membalas kegagalan koneksi sebagai 502 berstatus `failed`,
  // bukan hasil ambigu, supaya pemanggil tidak mengulang yang sebenarnya terkirim.
  const outcome: Outcome = res.ok
    ? "sent"
    : res.status === 429
      ? "rate_limited"
      : res.status >= 500
        ? "retryable"
        : "failed";

  return { outcome, status: res.status, body, reason };
}

/** Hitung pesan `sent` dalam 24 jam BERGULIR — Meta memakai jendela bergulir, bukan tanggal kalender. */
async function hitungTerkirim24Jam(admin: AdminClient): Promise<number> {
  const sejak = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("wa_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", sejak);
  return count ?? 0;
}

/**
 * Ringkasan jatah pengiriman 24 jam bergulir, untuk ditampilkan di halaman
 * WA Log. Dipusatkan di sini supaya angka batasnya tidak ditulis dua kali.
 */
export async function ringkasanKuotaWa(): Promise<{ terkirim: number; batas: number; sisa: number }> {
  const admin = createAdminClient();
  const terkirim = await hitungTerkirim24Jam(admin);
  return { terkirim, batas: BATAS_24JAM, sisa: Math.max(0, BATAS_24JAM - terkirim) };
}

/**
 * Klaim baris sebelum memanggil API: naikkan `wa_attempt_count` dari 0 ke 1
 * HANYA bila masih 0. Tidak ada baris terpengaruh berarti proses lain sudah
 * mengklaimnya (`after()` saat pendaftaran vs cron penadah), jadi pengiriman
 * dilewati. Duplikat berbiaya Rp 651 dan membuat donatur menerima dua tanda
 * terima bernomor sama.
 */
async function klaimPeserta(admin: AdminClient, pesertaId: string): Promise<boolean> {
  const { data } = await admin
    .from("peserta")
    .update({ wa_attempt_count: 1 })
    .eq("id", pesertaId)
    .eq("wa_attempt_count", 0)
    .select("id");
  return (data ?? []).length > 0;
}

/** Lepaskan klaim agar baris bisa diambil putaran cron berikutnya. */
async function lepasKlaim(admin: AdminClient, pesertaId: string): Promise<void> {
  await admin.from("peserta").update({ wa_attempt_count: 0 }).eq("id", pesertaId);
}

/**
 * Klaim baris untuk KIRIM ULANG MANUAL.
 *
 * Menyetel ulang status dan mengklaim barisnya dalam SATU pembaruan bersyarat.
 * Kalau keduanya dipisah — nol-kan dulu, klaim belakangan lewat `after()` —
 * dua klik beruntun menghasilkan dua pesan: klik kedua menol-kan klaim milik
 * klik pertama yang pengirimannya masih berjalan.
 *
 * Syaratnya "belum ada pengiriman berjalan": status bukan `pending`, ATAU
 * masih `pending` tapi belum diklaim siapa pun. Baris yang sedang dikirim
 * ditolak, dan pemanggil cukup diam.
 */
export async function klaimKirimUlang(pesertaId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("peserta")
    .update({ wa_status: "pending", wa_attempt_count: 1 })
    .eq("id", pesertaId)
    .eq("wa_dikecualikan", false)
    .or("wa_status.neq.pending,wa_attempt_count.eq.0")
    .select("id");
  return (data ?? []).length > 0;
}

async function catatLog(
  admin: AdminClient,
  pesertaId: string,
  status: "sent" | "failed",
  body: unknown,
  errorMessage: string | null,
): Promise<void> {
  await admin.from("wa_log").insert({
    peserta_id: pesertaId,
    status,
    // Nama kolomnya warisan Fonnte; kini berisi balasan crm-wa. Tidak diganti
    // karena butuh migrasi Supabase serentak dengan halaman WA Log.
    fonnte_response: body as object,
    error_message: errorMessage,
  });
}

/** Alasan yang dipasang sistem selalu berawalan ini, agar bisa dibedakan dari
 *  pengecualian yang disetel admin sendiri dan aman ditimpa ulang. */
export const PREFIX_ALASAN_OTOMATIS = "Otomatis:";

/**
 * Keluarkan satu peserta dari antrean SELAMANYA karena nomornya tidak lolos
 * `normalizeWaNumber`.
 *
 * Dulu baris seperti ini disetel `failed` — status yang justru jadi sasaran
 * tombol "Antre ulang", sehingga nomor rusak terangkut berulang tanpa pernah
 * bisa berhasil. Sekarang statusnya tetap `failed` agar riwayatnya jujur, tapi
 * `wa_dikecualikan` menahannya di luar antrean sampai nomornya diperbaiki.
 */
async function kecualikanOtomatis(admin: AdminClient, pesertaId: string): Promise<void> {
  await admin
    .from("peserta")
    .update({
      wa_status: "failed",
      wa_attempt_count: 0,
      wa_dikecualikan: true,
      wa_alasan_kecuali: `${PREFIX_ALASAN_OTOMATIS} nomor WhatsApp tidak valid`,
    })
    .eq("id", pesertaId);
  await catatLog(admin, pesertaId, "failed", null, "Nomor WhatsApp tidak valid");
}

/**
 * Sapu seluruh tabel peserta, tandai setiap nomor yang tidak lolos validasi.
 *
 * Dipakai sekali di halaman Log WhatsApp untuk membersihkan data lama sekaligus,
 * supaya admin tidak perlu menunggu cron menemukannya satu per satu. TIDAK
 * mengirim apa pun dan tidak menyentuh peserta yang sudah dikecualikan manual —
 * hanya menambah tanda pada yang nomornya memang tidak bisa dipakai.
 *
 * Validasinya dijalankan di JavaScript, bukan sebagai regex SQL, supaya tidak
 * ada definisi "nomor sah" kedua yang harus ikut dirawat.
 */
export async function tandaiNomorTidakValid(): Promise<{ ditandai: number; diperiksa: number }> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("peserta")
    .select("id, no_whatsapp")
    .eq("wa_dikecualikan", false);

  const rows = (data ?? []) as Array<{ id: string; no_whatsapp: string | null }>;
  const rusak = rows.filter((r) => !normalizeWaNumber(r.no_whatsapp ?? "")).map((r) => r.id);
  if (!rusak.length) return { ditandai: 0, diperiksa: rows.length };

  // Dipotong per 500 id agar URL PostgREST tidak kepanjangan.
  for (let i = 0; i < rusak.length; i += 500) {
    await admin
      .from("peserta")
      .update({
        wa_dikecualikan: true,
        wa_alasan_kecuali: `${PREFIX_ALASAN_OTOMATIS} nomor WhatsApp tidak valid`,
      })
      .in("id", rusak.slice(i, i + 500));
  }

  return { ditandai: rusak.length, diperiksa: rows.length };
}

/**
 * Hitung berapa peserta yang saat ini dikecualikan, dan berapa di antaranya
 * ditandai sistem. Dipakai halaman Log WhatsApp untuk menunjukkan bahwa
 * angka "gagal" yang besar sebagian besar memang bukan antrean nyata.
 */
export async function ringkasanPengecualian(): Promise<{ total: number; otomatis: number }> {
  const admin = createAdminClient();

  const { count: total } = await admin
    .from("peserta")
    .select("id", { count: "exact", head: true })
    .eq("wa_dikecualikan", true);

  const { count: otomatis } = await admin
    .from("peserta")
    .select("id", { count: "exact", head: true })
    .eq("wa_dikecualikan", true)
    .like("wa_alasan_kecuali", `${PREFIX_ALASAN_OTOMATIS}%`);

  return { total: total ?? 0, otomatis: otomatis ?? 0 };
}

/** Kirim satu pesan untuk baris yang SUDAH diklaim. */
async function kirimTerklaim(
  admin: AdminClient,
  pesertaId: string,
  target: string,
  template: WaTemplateInput,
): Promise<Outcome> {
  const parameters = buildTemplateParams(template);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callCrmWa(target, parameters);

    if (result.outcome === "rate_limited") {
      await catatLog(admin, pesertaId, "failed", result.body, `Batas laju crm-wa: ${result.reason}`);
      await lepasKlaim(admin, pesertaId);
      return "rate_limited";
    }

    await catatLog(
      admin,
      pesertaId,
      result.outcome === "sent" ? "sent" : "failed",
      result.body,
      result.outcome === "sent" ? null : result.reason,
    );

    if (result.outcome === "sent") {
      await admin.from("peserta").update({
        wa_status: "sent",
        wa_sent_at: new Date().toISOString(),
        wa_attempt_count: attempt,
      }).eq("id", pesertaId);
      return "sent";
    }

    // 4xx: permintaan salah, mengulang tidak menolong.
    if (result.outcome === "failed") break;

    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  await admin.from("peserta").update({
    wa_status: "failed",
    wa_attempt_count: MAX_ATTEMPTS,
  }).eq("id", pesertaId);
  return "failed";
}

/**
 * Kirim tanda terima untuk satu peserta. Aman dipanggil berkali-kali: barisnya
 * diklaim lebih dulu, jadi hanya satu proses yang benar-benar mengirim.
 */
export async function sendPesertaWa(opts: {
  pesertaId: string;
  noWhatsapp: string;
  template: WaTemplateInput;
  /** Setel true bila pemanggil sudah mengklaim barisnya via `klaimKirimUlang`. */
  sudahDiklaim?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const target = normalizeWaNumber(opts.noWhatsapp);

  if (!target) {
    await kecualikanOtomatis(admin, opts.pesertaId);
    return;
  }

  // Lewati bila jatah 24 jam habis; barisnya tetap `pending` dan disusul cron.
  if ((await hitungTerkirim24Jam(admin)) >= BATAS_24JAM) {
    if (opts.sudahDiklaim) await lepasKlaim(admin, opts.pesertaId);
    return;
  }

  if (!opts.sudahDiklaim && !(await klaimPeserta(admin, opts.pesertaId))) return;

  await kirimTerklaim(admin, opts.pesertaId, target, opts.template);
}

interface PendingPeserta {
  id: string;
  nama: string;
  alamat: string;
  no_whatsapp: string;
  nominal_donasi: number | string;
  nomor_tt: number | null;
  registered_at: string | null;
}

/**
 * Proses antrean WA: kirim tanda terima untuk semua peserta ber-status
 * `pending` yang sudah terdaftar. Dipanggil oleh cron, BUKAN oleh request
 * pendaftaran — supaya request tidak tertahan menunggu API.
 */
export async function processPendingWa(limit = BATCH): Promise<{ processed: number }> {
  const admin = createAdminClient();

  let terkirim24 = await hitungTerkirim24Jam(admin);
  if (terkirim24 >= BATAS_24JAM) return { processed: 0 };

  const ambil = Math.max(1, Math.min(limit, BATCH, BATAS_24JAM - terkirim24));

  const { data } = await admin
    .from("peserta")
    .select("id, nama, alamat, no_whatsapp, nominal_donasi, nomor_tt, registered_at")
    .eq("wa_status", "pending")
    // Baris ber-attempt > 0 tidak akan lolos klaim; jangan habiskan jatah batch.
    .eq("wa_attempt_count", 0)
    // Penjaga terakhir: apa pun yang ditandai jangan-kirim tidak ikut diambil,
    // sekalipun status `pending`-nya tersisa dari sebelum ditandai.
    .eq("wa_dikecualikan", false)
    .not("registered_at", "is", null)
    .order("registered_at", { ascending: true })
    .limit(ambil);

  const rows = (data ?? []) as PendingPeserta[];
  let processed = 0;

  for (const p of rows) {
    if (terkirim24 >= BATAS_24JAM) break;

    const target = normalizeWaNumber(p.no_whatsapp);
    if (!target) {
      await kecualikanOtomatis(admin, p.id);
      continue;
    }

    if (!(await klaimPeserta(admin, p.id))) continue;

    // Pastikan nomor tanda terima sudah ada.
    let nomorTT = p.nomor_tt;
    if (!nomorTT) {
      const { data: n } = await admin.rpc("assign_nomor_tt", { p_id: p.id });
      const num = Number(n);
      nomorTT = Number.isFinite(num) && num > 0 ? num : null;
    }

    if (processed > 0 && DELAY_SECONDS > 0) await sleep(DELAY_SECONDS * 1000);

    const hasil = await kirimTerklaim(admin, p.id, target, {
      nomor: formatNomorTT(nomorTT, p.registered_at),
      nama: p.nama,
      alamat: p.alamat,
      nominal_donasi: p.nominal_donasi,
      tanggal: formatTanggalIndo(p.registered_at),
    });

    // Kena batas laju: hentikan batch, sisanya tetap `pending` untuk putaran berikutnya.
    if (hasil === "rate_limited") break;

    if (hasil === "sent") terkirim24++;
    processed++;
  }

  return { processed };
}
