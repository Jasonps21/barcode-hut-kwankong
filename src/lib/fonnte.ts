import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildWaMessage,
  normalizeWaNumber,
  formatNomorTT,
  formatTanggalIndo,
  type WaTemplateInput,
} from "@/lib/wa-template";

const FONNTE_URL = process.env.FONNTE_API_URL ?? "https://api.fonnte.com/send";
const MAX_ATTEMPTS = 2;
// Serverless (Vercel) membatasi durasi fungsi (Hobby ~10 dtk). Retry harus
// singkat agar task `after()` tidak terbunuh sebelum selesai.
const RETRY_DELAY_MS = 3_000;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function callFonnte(target: string, message: string) {
  const token = process.env.FONNTE_API_TOKEN;
  if (!token) {
    return { ok: false as const, status: 0, body: { error: "FONNTE_API_TOKEN belum di-set" } };
  }

  const res = await fetch(FONNTE_URL, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ target, message, countryCode: "62" }).toString(),
  });

  let body: unknown;
  try { body = await res.json(); } catch { body = { error: "non-json response" }; }

  // Fonnte balas HTTP 200 dengan status:false untuk kegagalan logis
  // (mis. "invalid token", nomor tidak valid). Jadi cek field status juga.
  const b = body as { status?: boolean; reason?: string; detail?: string } | null;
  const fonnteOk = res.ok && b?.status !== false;
  const reason = b?.reason ?? b?.detail ?? `HTTP ${res.status}`;
  return { ok: fonnteOk, status: res.status, body, reason };
}

export async function sendPesertaWa(opts: {
  pesertaId: string;
  noWhatsapp: string;
  template: WaTemplateInput;
}): Promise<void> {
  const admin = createAdminClient();
  const target = normalizeWaNumber(opts.noWhatsapp);
  const message = buildWaMessage(opts.template);

  if (!target) {
    await admin.from("peserta")
      .update({ wa_status: "failed", wa_attempt_count: 0 })
      .eq("id", opts.pesertaId);
    await admin.from("wa_log").insert({
      peserta_id: opts.pesertaId,
      status: "failed",
      error_message: "Nomor WhatsApp tidak valid",
    });
    return;
  }

  const delaySec = Number(process.env.FONNTE_DELAY_SECONDS ?? 3);
  if (delaySec > 0) await sleep(delaySec * 1000);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await callFonnte(target, message);
    await admin.from("wa_log").insert({
      peserta_id: opts.pesertaId,
      status: result.ok ? "sent" : "failed",
      fonnte_response: result.body as object,
      error_message: result.ok ? null : result.reason,
    });

    if (result.ok) {
      await admin.from("peserta").update({
        wa_status: "sent",
        wa_sent_at: new Date().toISOString(),
        wa_attempt_count: attempt,
      }).eq("id", opts.pesertaId);
      return;
    }

    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  await admin.from("peserta").update({
    wa_status: "failed",
    wa_attempt_count: MAX_ATTEMPTS,
  }).eq("id", opts.pesertaId);
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
 * pendaftaran — supaya request tidak tertahan menunggu Fonnte.
 */
export async function processPendingWa(limit = 30): Promise<{ processed: number }> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("peserta")
    .select("id, nama, alamat, no_whatsapp, nominal_donasi, nomor_tt, registered_at")
    .eq("wa_status", "pending")
    .not("registered_at", "is", null)
    .order("registered_at", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as PendingPeserta[];
  let processed = 0;

  for (const p of rows) {
    // Pastikan nomor tanda terima sudah ada.
    let nomorTT = p.nomor_tt;
    if (!nomorTT) {
      const { data: n } = await admin.rpc("assign_nomor_tt", { p_id: p.id });
      const num = Number(n);
      nomorTT = Number.isFinite(num) && num > 0 ? num : null;
    }

    const { count } = await admin
      .from("kupon")
      .select("id", { count: "exact", head: true })
      .eq("peserta_id", p.id);

    await sendPesertaWa({
      pesertaId: p.id,
      noWhatsapp: p.no_whatsapp,
      template: {
        nomor: formatNomorTT(nomorTT, p.registered_at),
        nama: p.nama,
        alamat: p.alamat,
        nominal_donasi: p.nominal_donasi,
        tanggal: formatTanggalIndo(p.registered_at),
        total_kupon: count ?? 0,
      },
    });
    processed++;
  }

  return { processed };
}
