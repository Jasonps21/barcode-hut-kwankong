import "server-only";

/**
 * Jumlahkan kolom `nominal_donasi` dari SEMUA baris hasil query.
 *
 * PostgREST/Supabase membatasi jumlah baris yang dikembalikan per request
 * (default ~1000 baris). Menjumlahkan langsung dari `select().reduce()` akan
 * MEMOTONG total bila baris > 1000 — dan karena fungsi agregat PostgREST
 * dinonaktifkan di project ini, kita ambil semua baris secara paginasi lalu
 * jumlahkan di server.
 *
 * `makeQuery` harus MEMBUAT builder baru tiap dipanggil (sudah lengkap dengan
 * filter & `.select("nominal_donasi")`), agar range bisa diterapkan berulang.
 */
export async function sumNominalDonasi(
  makeQuery: () => {
    range: (from: number, to: number) => PromiseLike<{
      data: Array<{ nominal_donasi: number | string }> | null;
      error: unknown;
    }>;
  },
): Promise<number> {
  const PAGE = 1000;
  let total = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) total += Number(row.nominal_donasi ?? 0);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return total;
}
