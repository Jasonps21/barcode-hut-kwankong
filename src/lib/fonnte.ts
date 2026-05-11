import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildWaMessage, normalizeWaNumber, type WaTemplateInput } from "@/lib/wa-template";

const FONNTE_URL = process.env.FONNTE_API_URL ?? "https://api.fonnte.com/send";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 100_000; // ~5 menit total dengan 3 percobaan

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
  return { ok: res.ok, status: res.status, body };
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
      error_message: result.ok ? null : `HTTP ${result.status}`,
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
