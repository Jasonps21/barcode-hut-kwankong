import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ambilSemuaBaris } from "@/lib/query-semua";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Ekspor SEMUA anggota, satu baris per orang, dengan total setoran tiap
 * kegiatan sebagai kolom terpisah — supaya riwayat lintas acara terbaca
 * dalam satu lembar tanpa menggandakan baris orang yang sama.
 */
export async function GET() {
  await requireProfile(["admin"]);
  const admin = createAdminClient();

  // `select()` biasa berhenti di 1000 baris; kedua tabel sudah lewat angka itu.
  const [anggota, donasi, { data: kegiatanData }] = await Promise.all([
    ambilSemuaBaris<{
      id: string; nama: string; nama_hanzi: string | null; alamat: string | null;
      no_whatsapp: string | null; kota_kabupaten: string | null; aktif: boolean;
      wa_dikecualikan: boolean; created_at: string; kelompok: { nama: string } | null;
    }>(() =>
      admin
        .from("anggota")
        .select("id, nama, nama_hanzi, alamat, no_whatsapp, kota_kabupaten, aktif, wa_dikecualikan, created_at, kelompok:buku_id(nama)")
        .order("nama", { ascending: true })
        .order("id", { ascending: true }) as never,
    ),
    ambilSemuaBaris<{ anggota_id: string; kegiatan_id: string; nominal: number | string; tanggal: string }>(() =>
      admin
        .from("donasi")
        .select("anggota_id, kegiatan_id, nominal, tanggal")
        .order("id", { ascending: true }) as never,
    ),
    admin.from("kegiatan").select("id, nama").order("tahun", { ascending: true, nullsFirst: true }).order("created_at"),
  ]);

  const kegiatan = (kegiatanData ?? []) as Array<{ id: string; nama: string }>;
  const total = new Map<string, number>(); // `${anggota}|${kegiatan}` -> nominal
  const terakhir = new Map<string, string>();
  for (const d of donasi) {
    const key = `${d.anggota_id}|${d.kegiatan_id}`;
    total.set(key, (total.get(key) ?? 0) + Number(d.nominal ?? 0));
    const t = terakhir.get(d.anggota_id);
    if (!t || d.tanggal > t) terakhir.set(d.anggota_id, d.tanggal);
  }

  const header = [
    "Nama", "Nama Hanzi", "Alamat", "Kota/Kabupaten", "No WhatsApp", "Buku", "Status",
    ...kegiatan.map((k) => `Setoran ${k.nama}`),
    "Setoran Terakhir", "Terdaftar Sejak",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const a of anggota) {
    lines.push([
      a.nama, a.nama_hanzi ?? "", a.alamat ?? "", a.kota_kabupaten ?? "", a.no_whatsapp ?? "",
      a.kelompok?.nama ?? "",
      a.aktif ? (a.wa_dikecualikan ? "Aktif (jangan kirim WA)" : "Aktif") : "Tidak aktif",
      ...kegiatan.map((k) => total.get(`${a.id}|${k.id}`) ?? 0),
      terakhir.get(a.id) ?? "",
      a.created_at,
    ].map(csvEscape).join(","));
  }

  const csv = "﻿" + lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="semua-anggota.csv"',
    },
  });
}
