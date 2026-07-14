import wilayahData from "@/data/wilayah.json";

interface WilayahData {
  provinsi: string[];
  kotaByProvinsi: Record<string, string[]>;
}

const data = wilayahData as WilayahData;

export const daftarProvinsi: string[] = data.provinsi;

/** Kota/Kabupaten untuk provinsi tertentu. Kosong bila provinsi belum dipilih/tidak dikenal. */
export function kotaUntukProvinsi(provinsi: string): string[] {
  return data.kotaByProvinsi[provinsi] ?? [];
}

/** Semua kota/kabupaten (dipakai saat provinsi belum dipilih, agar tetap bisa cari langsung dari kota). */
export function semuaKota(): string[] {
  return Object.values(data.kotaByProvinsi).flat();
}
