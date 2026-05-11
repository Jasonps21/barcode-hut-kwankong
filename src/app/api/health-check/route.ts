import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("kelompok").select("id", { head: true, count: "exact" });
    if (error) throw error;
    return Response.json({
      ok: true,
      db: "up",
      latency_ms: Date.now() - started,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { ok: false, db: "down", error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
