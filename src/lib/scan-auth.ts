import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE_NAME = "scan_pin_ok";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 jam, cukup untuk 1 sesi acara
const SETTINGS_KEY = "scan_pin";

function sign(): string {
  // Reuse service role key sebagai secret HMAC — sudah rahasia & tersedia,
  // tidak perlu env var tambahan hanya untuk menandatangani cookie.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHmac("sha256", secret).update("scan-access").digest("hex");
}

export async function hasScanAccess(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = sign();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** PIN disimpan di tabel app_settings, diubah admin lewat halaman Pengaturan.
 *  Fallback ke env var SCAN_PIN kalau belum pernah diset lewat UI. */
export async function getScanPin(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const fromDb = (data as { value: string } | null)?.value;
  return fromDb ?? process.env.SCAN_PIN ?? null;
}

export async function setScanPin(pin: string, updatedBy: string): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: pin, updated_at: new Date().toISOString(), updated_by: updatedBy });
  return error ? { error: error.message } : {};
}

export async function verifyPin(pin: string): Promise<boolean> {
  const expected = await getScanPin();
  if (!expected) return false;
  return pin.trim() === expected;
}

export async function grantScanAccess(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}
