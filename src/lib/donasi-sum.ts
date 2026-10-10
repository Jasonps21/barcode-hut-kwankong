import "server-only";
import { ambilSemuaBaris, type QueryBisaRange } from "@/lib/query-semua";

/**
 * DEFINISI TUNGGAL "donasi yang dihitung", dipakai SEMUA halaman & export:
 * baris view `donasi_lengkap` milik SATU kegiatan.
 *
 * Tabel `donasi` sudah menolak nominal nol di database, jadi syarat yang
 * tersisa hanya kegiatannya. Syarat itu tetap dipusatkan di sini karena
 * menjumlahkan uang lintas kegiatan tanpa sadar adalah kesalahan yang paling
 * mudah terjadi sejak satu anggota bisa menyumbang di banyak acara.
 * `kegiatanId` null = sengaja lintas kegiatan.
 */
interface FilterDonasi {
  eq(column: string, value: unknown): FilterDonasi;
}
export function hanyaDonasiTerhitung<T>(query: T, kegiatanId: string | null): T {
  if (!kegiatanId) return query;
  return (query as unknown as FilterDonasi).eq("kegiatan_id", kegiatanId) as unknown as T;
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
