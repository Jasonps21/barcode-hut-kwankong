import "server-only";

/** Batas baris per request PostgREST/Supabase di project ini. */
export const PAGE_SUPABASE = 1000;

export interface QueryBisaRange<T> {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

/**
 * Ambil SEMUA baris hasil query, menembus batas ~1000 baris per request.
 *
 * `makeQuery` harus MEMBUAT builder baru tiap dipanggil (lengkap dengan filter,
 * select, dan `.order(...)`) supaya `.range()` bisa diterapkan berulang.
 *
 * PENTING — `.order()` wajib dan harus deterministik (akhiri dengan kolom unik
 * seperti `id`). Tanpa itu Postgres tidak menjamin urutan antar-request, jadi
 * baris bisa dobel atau terlewat di batas halaman dan totalnya berubah-ubah
 * tiap refresh tanpa datanya berubah.
 *
 * Error TIDAK ditelan: total uang yang diam-diam terpotong jauh lebih berbahaya
 * daripada halaman yang gagal dengan jelas.
 */
export async function ambilSemuaBaris<T>(makeQuery: () => QueryBisaRange<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SUPABASE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SUPABASE - 1);
    if (error) throw new Error(`Gagal mengambil data (offset ${from}): ${error.message}`);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SUPABASE) break;
  }
  return out;
}
