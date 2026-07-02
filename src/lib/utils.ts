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

/** Zona waktu acuan aplikasi ini (WITA / Makassar). */
export const APP_TIME_ZONE = "Asia/Makassar";

export function formatTanggalWITA(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { timeZone: APP_TIME_ZONE, ...opts });
}

export function formatJamWITA(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", ...opts });
}

export function formatTanggalJamWITA(iso: string | null | undefined): string {
  if (!iso) return "-";
  const tgl = formatTanggalWITA(iso);
  const jam = formatJamWITA(iso);
  return jam ? `${tgl} ${jam}` : tgl;
}

/** Ambil komponen tanggal (YYYY-MM-DD) sesuai WITA, untuk keperluan pengelompokan per-hari. */
export function dateKeyWITA(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
