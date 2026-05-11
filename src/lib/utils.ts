import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (v == null || Number.isNaN(v)) return "Rp 0";
  return "Rp " + v.toLocaleString("id-ID");
}
