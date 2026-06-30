import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildWaMessage, normalizeWaNumber, type WaTemplateInput } from "@/lib/wa-template";

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
