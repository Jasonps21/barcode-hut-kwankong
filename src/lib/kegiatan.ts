import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Kegiatan } from "@/types/database";

/**
 * Kegiatan yang sedang berjalan — dipakai form input donasi sebagai tujuan
 * default. Di-cache per-request supaya layout & page tidak query dua kali.
 *
 * Database mengunci "hanya satu kegiatan aktif" lewat unique index, jadi di
 * sini cukup ambil satu baris tanpa perlu memilih-milih.
 */
export const getKegiatanAktif = cache(async (): Promise<Kegiatan | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kegiatan")
    .select("*")
    .eq("aktif", true)
    .maybeSingle();
  return (data as Kegiatan) ?? null;
});

/** Semua kegiatan, terbaru dulu — untuk penyaring di halaman riwayat & laporan. */
export const getSemuaKegiatan = cache(async (): Promise<Kegiatan[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kegiatan")
    .select("*")
    .order("tahun", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as Kegiatan[]) ?? [];
});

/**
 * Tentukan kegiatan yang sedang dilihat di halaman laporan dari `?kegiatan=`.
 *
 * Tanpa parameter (atau id yang tidak dikenal) jatuh ke kegiatan berjalan,
 * lalu ke kegiatan terbaru — supaya halaman tidak pernah mencampur uang dari
 * beberapa acara tanpa disengaja.
 */
export async function pilihKegiatan(
  param: string | null | undefined,
): Promise<{ kegiatan: Kegiatan | null; semua: Kegiatan[] }> {
  const semua = await getSemuaKegiatan();
  const kegiatan =
    (param && semua.find((k) => k.id === param)) ||
    semua.find((k) => k.aktif) ||
    semua[0] ||
    null;
  return { kegiatan, semua };
}
