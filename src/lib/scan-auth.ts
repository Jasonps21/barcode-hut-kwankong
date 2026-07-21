import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "scan_pin_ok";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 jam, cukup untuk 1 sesi acara

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

export function verifyPin(pin: string): boolean {
  const expected = process.env.SCAN_PIN;
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
