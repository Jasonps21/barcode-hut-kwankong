import { NextResponse } from "next/server";
import { processPendingWa } from "@/lib/fonnte";

// Beri ruang waktu untuk memproses satu batch WA (delay + retry per pesan).
export const maxDuration = 60;
// Jangan pernah di-cache; selalu proses antrean terbaru.
export const dynamic = "force-dynamic";

/**
 * Endpoint cron pemroses antrean WA. Dipanggil oleh Vercel Cron sesuai jadwal
 * di vercel.json. Vercel otomatis mengirim header
 * `Authorization: Bearer <CRON_SECRET>` bila env `CRON_SECRET` di-set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const result = await processPendingWa(30);
  return NextResponse.json({ ok: true, ...result });
}
