import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LogErrorInput {
  source: "server" | "client";
  message: string;
  stack?: string | null;
  digest?: string | null;
  url?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | null;
}

/**
 * Simpan error ke tabel error_logs supaya bisa dibaca dari menu "Log Error"
 * di aplikasi. Tidak pernah melempar error baru — logger yang gagal tidak
 * boleh ikut menjatuhkan alur yang sedang berjalan.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("error_logs").insert({
      source: input.source,
      message: input.message.slice(0, 2000),
      stack: input.stack?.slice(0, 8000) ?? null,
      digest: input.digest ?? null,
      url: input.url?.slice(0, 500) ?? null,
      user_id: input.userId ?? null,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
      context: input.context ?? null,
    });
  } catch (e) {
    console.error("[log-error] gagal simpan error log:", e);
  }
}
