"use server";

import { verifyPin, grantScanAccess, setKonterLabel } from "@/lib/scan-auth";

export async function unlockScan(pin: string, konter?: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await verifyPin(pin))) return { ok: false, error: "PIN salah." };
  await grantScanAccess();
  if (konter) await setKonterLabel(konter);
  return { ok: true };
}
