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
 *
 * Satu tanda terima = satu baris `donasi`. Status kirim, klaim, dan nomor TT
 * menempel di donasi; tanda "jangan kirim" menempel di `anggota` karena yang
 * bermasalah adalah nomornya, bukan setorannya.
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
 * mengklaimnya (`after()` saat input donasi vs cron penadah), jadi pengiriman
 * dilewati. Duplikat berbiaya Rp 651 dan membuat donatur menerima dua tanda
 * terima bernomor sama.
 */
async function klaimDonasi(admin: AdminClient, donasiId: string): Promise<boolean> {
  const { data } = await admin
    .from("donasi")
    .update({ wa_attempt_count: 1 })
    .eq("id", donasiId)
    .eq("wa_attempt_count", 0)
    .select("id");
  return (data ?? []).length > 0;
}

/** Lepaskan klaim agar baris bisa diambil putaran cron berikutnya. */
async function lepasKlaim(admin: AdminClient, donasiId: string): Promise<void> {
  await admin.from("donasi").update({ wa_attempt_count: 0 }).eq("id", donasiId);
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
export async function klaimKirimUlang(donasiId: string): Promise<boolean> {
  const admin = createAdminClient();

  // Tanda "jangan kirim" ada di anggota; UPDATE pada donasi tidak bisa
  // menyaring kolom tabel lain, jadi diperiksa lebih dulu lewat view.
  const { data: cek } = await admin
    .from("donasi_lengkap")
    .select("wa_dikecualikan")
    .eq("id", donasiId)
    .maybeSingle();
  if (!cek || (cek as { wa_dikecualikan: boolean | null }).wa_dikecualikan) return false;

  const { data } = await admin
    .from("donasi")
    .update({ wa_status: "pending", wa_attempt_count: 1 })
    .eq("id", donasiId)
    .or("wa_status.neq.pending,wa_attempt_count.eq.0")
    .select("id");
  return (data ?? []).length > 0;
}

async function catatLog(
  admin: AdminClient,
  donasiId: string,
  status: "sent" | "failed",
  body: unknown,
  errorMessage: string | null,
): Promise<void> {
  await admin.from("wa_log").insert({
    donasi_id: donasiId,
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
 * Keluarkan satu donasi dari antrean karena nomor anggotanya tidak lolos
 * `normalizeWaNumber`.
 *
 * Status donasinya `failed` agar riwayatnya jujur, dan tanda `wa_dikecualikan`
 * dipasang di ANGGOTA — supaya donasi lain milik orang yang sama juga tidak
 * dicoba sampai nomornya diperbaiki.
 */
async function kecualikanOtomatis(admin: AdminClient, donasiId: string, anggotaId: string): Promise<void> {
  await admin
    .from("donasi")
    .update({ wa_status: "failed", wa_attempt_count: 0 })
    .eq("id", donasiId);
  await admin
    .from("anggota")
    .update({
      wa_dikecualikan: true,
      wa_alasan_kecuali: `${PREFIX_ALASAN_OTOMATIS} nomor WhatsApp tidak valid`,
    })
    .eq("id", anggotaId);
  await catatLog(admin, donasiId, "failed", null, "Nomor WhatsApp tidak valid");
}

/**
 * Sapu seluruh tabel anggota, tandai setiap nomor yang tidak lolos validasi.
 *
 * Dipakai sekali di halaman Log WhatsApp untuk membersihkan data lama sekaligus,
 * supaya admin tidak perlu menunggu cron menemukannya satu per satu. TIDAK
 * mengirim apa pun dan tidak menyentuh anggota yang sudah dikecualikan manual —
 * hanya menambah tanda pada yang nomornya memang tidak bisa dipakai.
 *
 * Validasinya dijalankan di JavaScript, bukan sebagai regex SQL, supaya tidak
 * ada definisi "nomor sah" kedua yang harus ikut dirawat.
 */
export async function tandaiNomorTidakValid(): Promise<{ ditandai: number; diperiksa: number }> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("anggota")
    .select("id, no_whatsapp")
    .eq("wa_dikecualikan", false)
    // Batas bawaan PostgREST 1000 baris; anggota sudah lewat angka itu.
    .limit(20000);

  const rows = (data ?? []) as Array<{ id: string; no_whatsapp: string | null }>;
  const rusak = rows.filter((r) => !normalizeWaNumber(r.no_whatsapp ?? "")).map((r) => r.id);
  if (!rusak.length) return { ditandai: 0, diperiksa: rows.length };

  // Dipotong per 500 id agar URL PostgREST tidak kepanjangan.
  for (let i = 0; i < rusak.length; i += 500) {
    await admin
      .from("anggota")
      .update({
        wa_dikecualikan: true,
        wa_alasan_kecuali: `${PREFIX_ALASAN_OTOMATIS} nomor WhatsApp tidak valid`,
      })
      .in("id", rusak.slice(i, i + 500));
  }

  return { ditandai: rusak.length, diperiksa: rows.length };
}

/**
 * Hitung berapa anggota yang saat ini dikecualikan, dan berapa di antaranya
 * ditandai sistem. Dipakai halaman Log WhatsApp untuk menunjukkan bahwa
 * angka "gagal" yang besar sebagian besar memang bukan antrean nyata.
 */
export async function ringkasanPengecualian(): Promise<{ total: number; otomatis: number }> {
  const admin = createAdminClient();

  const { count: total } = await admin
    .from("anggota")
    .select("id", { count: "exact", head: true })
    .eq("wa_dikecualikan", true);

  const { count: otomatis } = await admin
    .from("anggota")
    .select("id", { count: "exact", head: true })
    .eq("wa_dikecualikan", true)
    .like("wa_alasan_kecuali", `${PREFIX_ALASAN_OTOMATIS}%`);

  return { total: total ?? 0, otomatis: otomatis ?? 0 };
}

/** Kirim satu pesan untuk baris yang SUDAH diklaim. */
async function kirimTerklaim(
  admin: AdminClient,
  donasiId: string,
  target: string,
  template: WaTemplateInput,
): Promise<Outcome> {
  const parameters = buildTemplateParams(template);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callCrmWa(target, parameters);

    if (result.outcome === "rate_limited") {
      await catatLog(admin, donasiId, "failed", result.body, `Batas laju crm-wa: ${result.reason}`);
      await lepasKlaim(admin, donasiId);
      return "rate_limited";
    }

    await catatLog(
      admin,
      donasiId,
      result.outcome === "sent" ? "sent" : "failed",
      result.body,
      result.outcome === "sent" ? null : result.reason,
    );

    if (result.outcome === "sent") {
      await admin.from("donasi").update({
        wa_status: "sent",
        wa_sent_at: new Date().toISOString(),
        wa_attempt_count: attempt,
      }).eq("id", donasiId);
      return "sent";
    }

    // 4xx: permintaan salah, mengulang tidak menolong.
    if (result.outcome === "failed") break;

    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  await admin.from("donasi").update({
    wa_status: "failed",
    wa_attempt_count: MAX_ATTEMPTS,
  }).eq("id", donasiId);
  return "failed";
}

/**
 * Kirim tanda terima untuk satu donasi. Aman dipanggil berkali-kali: barisnya
 * diklaim lebih dulu, jadi hanya satu proses yang benar-benar mengirim.
 */
export async function sendDonasiWa(opts: {
  donasiId: string;
  anggotaId: string;
  noWhatsapp: string;
  template: WaTemplateInput;
  /** Setel true bila pemanggil sudah mengklaim barisnya via `klaimKirimUlang`. */
  sudahDiklaim?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const target = normalizeWaNumber(opts.noWhatsapp);

  if (!target) {
    await kecualikanOtomatis(admin, opts.donasiId, opts.anggotaId);
    return;
  }

  // Lewati bila jatah 24 jam habis; barisnya tetap `pending` dan disusul cron.
  if ((await hitungTerkirim24Jam(admin)) >= BATAS_24JAM) {
    if (opts.sudahDiklaim) await lepasKlaim(admin, opts.donasiId);
    return;
  }

  if (!opts.sudahDiklaim && !(await klaimDonasi(admin, opts.donasiId))) return;

  await kirimTerklaim(admin, opts.donasiId, target, opts.template);
}

interface PendingDonasi {
  id: string;
  anggota_id: string;
  nama: string;
  alamat: string | null;
  no_whatsapp: string | null;
  nominal_donasi: number | string;
  nomor_tt: number | null;
  registered_at: string | null;
}

/**
 * Proses antrean WA: kirim tanda terima untuk semua donasi ber-status
 * `pending`. Dipanggil oleh cron, BUKAN oleh request input donasi — supaya
 * request tidak tertahan menunggu API.
 */
export async function processPendingWa(limit = BATCH): Promise<{ processed: number }> {
  const admin = createAdminClient();

  let terkirim24 = await hitungTerkirim24Jam(admin);
  if (terkirim24 >= BATAS_24JAM) return { processed: 0 };

  const ambil = Math.max(1, Math.min(limit, BATCH, BATAS_24JAM - terkirim24));

  const { data } = await admin
    .from("donasi_lengkap")
    .select("id, anggota_id, nama, alamat, no_whatsapp, nominal_donasi, nomor_tt, registered_at")
    .eq("wa_status", "pending")
    // Baris ber-attempt > 0 tidak akan lolos klaim; jangan habiskan jatah batch.
    .eq("wa_attempt_count", 0)
    // Penjaga terakhir: apa pun yang ditandai jangan-kirim tidak ikut diambil,
    // sekalipun status `pending`-nya tersisa dari sebelum ditandai.
    .eq("wa_dikecualikan", false)
    .order("registered_at", { ascending: true })
    .limit(ambil);

  const rows = (data ?? []) as PendingDonasi[];
  let processed = 0;

  for (const p of rows) {
    if (terkirim24 >= BATAS_24JAM) break;

    const target = normalizeWaNumber(p.no_whatsapp ?? "");
    if (!target) {
      await kecualikanOtomatis(admin, p.id, p.anggota_id);
      continue;
    }

    if (!(await klaimDonasi(admin, p.id))) continue;

    // Pastikan nomor tanda terima sudah ada.
    let nomorTT = p.nomor_tt;
    if (!nomorTT) {
      const { data: n } = await admin.rpc("assign_nomor_tt_donasi", { p_donasi_id: p.id });
      const num = Number(n);
      nomorTT = Number.isFinite(num) && num > 0 ? num : null;
    }

    if (processed > 0 && DELAY_SECONDS > 0) await sleep(DELAY_SECONDS * 1000);

    const hasil = await kirimTerklaim(admin, p.id, target, {
      nomor: formatNomorTT(nomorTT, p.registered_at),
      nama: p.nama,
      alamat: p.alamat ?? "",
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
