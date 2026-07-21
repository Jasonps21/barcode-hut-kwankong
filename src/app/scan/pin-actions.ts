"use server";

import { verifyPin, grantScanAccess } from "@/lib/scan-auth";

export async function unlockScan(pin: string): Promise<{ ok: boolean; error?: string }> {
  if (!verifyPin(pin)) return { ok: false, error: "PIN salah." };
  await grantScanAccess();
  return { ok: true };
}
