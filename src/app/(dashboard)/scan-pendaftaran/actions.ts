"use server";

import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AnggotaHit {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  pinyin: string | null;
  alamat: string | null;
  no_whatsapp: string | null;
  buku_nama: string | null;
  /** Setoran terakhir lintas kegiatan — angka acuan penagih. */
  terakhir: { nominal: number; tanggal: string; kegiatan: string } | null;
  /** Jumlah setoran di kegiatan berjalan, supaya petugas tahu kalau ini setoran tambahan. */
  setoranKegiatanIni: number;
}

/**
 * Cari anggota berdasarkan nama / alamat / no HP / nama hanzi / pinyin.
 * Memakai admin client lalu di-scope manual sesuai role (petugas hanya bukunya).
 */
export async function searchAnggotaAction(query: string, kegiatanId: string | null): Promise<AnggotaHit[]> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const q = query.trim();
  if (q.length < 2) return [];

  const admin = createAdminClient();
  const like = `%${q}%`;

  let builder = admin
    .from("anggota")
    .select("id, nama, nama_hanzi, pinyin, alamat, no_whatsapp, kelompok:buku_id(nama)")
    .eq("aktif", true)
    .or(
      [
        `nama.ilike.${like}`,
        `alamat.ilike.${like}`,
        `no_whatsapp.ilike.${like}`,
        `nama_hanzi.ilike.${like}`,
        `pinyin.ilike.${like}`,
      ].join(","),
    )
    .order("nama")
    .limit(25);

  if (profile.role !== "admin" && profile.kelompok_id) {
    builder = builder.eq("buku_id", profile.kelompok_id);
  }

  const { data, error } = await builder;
  if (error || !data) return [];

  const rows = data as unknown as Array<{
    id: string; nama: string; nama_hanzi: string | null; pinyin: string | null;
    alamat: string | null; no_whatsapp: string | null; kelompok: { nama: string } | null;
  }>;

  const terakhir = new Map<string, AnggotaHit["terakhir"]>();
  const diKegiatanIni = new Map<string, number>();
  if (rows.length) {
    const { data: dData } = await admin
      .from("donasi")
      .select("anggota_id, kegiatan_id, nominal, tanggal, kegiatan(nama)")
      .in("anggota_id", rows.map((r) => r.id))
      .order("tanggal", { ascending: false });
    for (const d of (dData ?? []) as unknown as Array<{
      anggota_id: string; kegiatan_id: string; nominal: number | string; tanggal: string; kegiatan: { nama: string } | null;
    }>) {
      if (!terakhir.has(d.anggota_id)) {
        terakhir.set(d.anggota_id, { nominal: Number(d.nominal ?? 0), tanggal: d.tanggal, kegiatan: d.kegiatan?.nama ?? "-" });
      }
      if (kegiatanId && d.kegiatan_id === kegiatanId) {
        diKegiatanIni.set(d.anggota_id, (diKegiatanIni.get(d.anggota_id) ?? 0) + 1);
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    nama: r.nama,
    nama_hanzi: r.nama_hanzi,
    pinyin: r.pinyin,
    alamat: r.alamat,
    no_whatsapp: r.no_whatsapp,
    buku_nama: r.kelompok?.nama ?? null,
    terakhir: terakhir.get(r.id) ?? null,
    setoranKegiatanIni: diKegiatanIni.get(r.id) ?? 0,
  }));
}
