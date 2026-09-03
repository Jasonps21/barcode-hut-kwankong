import "server-only";
import { ambilSemuaBaris, type QueryBisaRange } from "@/lib/query-semua";

/**
 * DEFINISI TUNGGAL "donasi yang dihitung", dipakai SEMUA halaman & export:
 * peserta yang sudah selesai registrasi (`registered_at` terisi) DAN nominalnya
 * di atas nol.
 *
 * Dulu tiap halaman memakai syaratnya sendiri — Transaksi tanpa cek
 * `registered_at`, Dashboard dengan cek — sehingga total cash/transfer berbeda
 * antar halaman untuk data yang sama. Jangan menyalin filter ini secara manual;
 * panggil fungsi ini supaya definisinya tetap satu.
 */
interface FilterDonasi {
  not(column: string, operator: string, value: unknown): FilterDonasi;
  gt(column: string, value: unknown): FilterDonasi;
}
export function hanyaDonasiTerhitung<T>(query: T): T {
  const q = query as unknown as FilterDonasi;
  return q.not("registered_at", "is", null).gt("nominal_donasi", 0) as unknown as T;
}

/**
 * Versi in-memory dari `hanyaDonasiTerhitung`, untuk baris yang sudah terlanjur
 * diambil (mis. daftar aktivitas petugas yang tetap ingin menampilkan peserta
 * tanpa donasi). Definisinya wajib sama persis dengan filter di atas.
 */
export function adalahDonasiTerhitung(row: {
  registered_at: string | null;
  nominal_donasi: number | string | null;
}): boolean {
  return row.registered_at != null && Number(row.nominal_donasi ?? 0) > 0;
}

/**
 * Jumlahkan kolom `nominal_donasi` dari SEMUA baris hasil query.
 *
 * Menjumlahkan langsung dari `select().reduce()` akan MEMOTONG total bila baris
 * > 1000 (batas PostgREST), dan fungsi agregat PostgREST dinonaktifkan di
 * project ini — jadi baris diambil bertahap lalu dijumlahkan di server.
 *
 * `makeQuery` harus membuat builder baru tiap dipanggil, sudah lengkap dengan
 * filter, `.select("nominal_donasi")`, dan `.order(...)` yang deterministik.
 */
export async function sumNominalDonasi(
  makeQuery: () => QueryBisaRange<{ nominal_donasi: number | string }>,
): Promise<number> {
  const rows = await ambilSemuaBaris(makeQuery);
  let total = 0;
  for (const row of rows) total += Number(row.nominal_donasi ?? 0);
  return total;
}
