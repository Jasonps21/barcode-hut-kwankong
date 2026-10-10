import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hanyaDonasiTerhitung } from "@/lib/donasi-sum";
import { ambilSemuaBaris } from "@/lib/query-semua";
import { BUKTI_BUCKET } from "@/lib/bukti";
import { buatXlsxBerfoto, type BarisFoto, type KolomSpec } from "@/lib/xlsx-foto";
import { formatJamWITA, formatTanggalWITA } from "@/lib/utils";
import { pilihKegiatan } from "@/lib/kegiatan";

// Mengunduh ~100 bukti dari Storage lalu merangkainya jadi xlsx jelas lebih
// lama dari permintaan biasa.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Berapa berkas diunduh bersamaan. Cukup untuk memangkas waktu tunggu tanpa
 *  membanjiri Storage dengan permintaan serentak. */
const PARALEL = 6;

/** Pagar pengaman: di atas ini arsipnya jadi terlalu berat untuk dibuka Excel
 *  dan berisiko melewati batas waktu fungsi. Pemakai diarahkan mempersempit
 *  filter, bukan dibiarkan menunggu permintaan yang pasti gagal. */
const MAKS_FOTO = 400;

interface DonaturRow {
  id: string;
  nomor_tt: number | null;
  nama: string;
  nama_hanzi: string | null;
  alamat: string | null;
  kota_kabupaten: string | null;
  no_whatsapp: string | null;
  nominal_donasi: number | string;
  metode_bayar: string | null;
  bukti_transfer_path: string | null;
  registered_at: string | null;
  created_by: string | null;
  kelompok: { nama: string } | null;
}

const KOLOM: KolomSpec[] = [
  { judul: "No. TT", lebar: 9 },
  { judul: "Nama", lebar: 32 },
  { judul: "Nama Hanzi", lebar: 16 },
  { judul: "Kelompok", lebar: 20 },
  { judul: "Alamat", lebar: 30 },
  { judul: "Kota/Kabupaten", lebar: 20 },
  { judul: "WhatsApp", lebar: 16 },
  { judul: "Metode", lebar: 10 },
  { judul: "Nominal", lebar: 16, angka: true },
  { judul: "Tanggal", lebar: 14 },
  { judul: "Jam", lebar: 9 },
  { judul: "Petugas", lebar: 18 },
];

/** Jalankan tugas dengan batas jumlah yang berjalan bersamaan. */
async function petaTerbatas<T, R>(
  items: T[],
  batas: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const hasil = new Array<R>(items.length);
  let berikutnya = 0;
  await Promise.all(
    Array.from({ length: Math.min(batas, items.length) }, async () => {
      for (;;) {
        const i = berikutnya++;
        if (i >= items.length) return;
        hasil[i] = await fn(items[i], i);
      }
    }),
  );
  return hasil;
}

export async function GET(req: NextRequest) {
  await requireProfile(["admin"]);

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const metodeRaw = sp.get("metode") ?? "all";
  const metode = metodeRaw === "cash" || metodeRaw === "transfer" ? metodeRaw : "all";
  // Default hanya baris yang punya bukti — itu yang biasanya dicari saat
  // mencocokkan uang masuk. "semua" menyertakan cash yang memang tak berbukti.
  const cakupan = sp.get("cakupan") === "semua" ? "semua" : "berbukti";

  const admin = createAdminClient();
  const { kegiatan } = await pilihKegiatan(sp.get("kegiatan"));
  const kegiatanId = kegiatan?.id ?? null;

  // "*" dipakai alih-alih daftar kolom panjang: dengan banyaknya filter
  // bersyarat di bawah, daftar eksplisit membuat inferensi tipe PostgREST
  // menggali terlalu dalam sampai tsc menyerah (TS2589).
  const makeQuery = () => {
    let q = hanyaDonasiTerhitung(
      admin
        .from("donasi_lengkap")
        .select("*, kelompok:kelompok_id(nama)")
        .order("registered_at", { ascending: true })
        .order("id", { ascending: true }),
      kegiatanId,
    );
    if (from) q = q.gte("registered_at", `${from}T00:00:00`);
    if (to) q = q.lte("registered_at", `${to}T23:59:59.999`);
    if (metode !== "all") q = q.eq("metode_bayar", metode);
    return q;
  };

  // Ambil semua baris (batas PostgREST 1000/request) supaya export bukti tidak
  // diam-diam kehilangan baris saat donasi sudah lewat seribu.
  let data: unknown[];
  try {
    data = await ambilSemuaBaris<unknown>(makeQuery as never);
  } catch (e) {
    return new NextResponse(`Gagal mengambil data: ${(e as Error).message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Penyaringan "punya bukti" dikerjakan di sini, bukan sebagai rantai filter
  // tambahan di query: satu penyaring lagi membuat inferensi tipe PostgREST
  // melewati batas kedalaman tsc (TS2589), sedangkan datanya toh sudah terambil.
  const semua = (data ?? []) as unknown as DonaturRow[];
  const rows = cakupan === "berbukti" ? semua.filter((r) => r.bukti_transfer_path) : semua;
  if (rows.length === 0) {
    return new NextResponse("Tidak ada data donasi yang cocok dengan filter ini.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const berbukti = rows.filter((r) => r.bukti_transfer_path);
  if (berbukti.length > MAKS_FOTO) {
    return new NextResponse(
      `Terlalu banyak bukti untuk satu berkas (${berbukti.length} foto, maks ${MAKS_FOTO}). ` +
        `Persempit rentang tanggal lalu unduh per periode.`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // ---- nama petugas ----
  const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  const petugas = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, nama").in("id", ids);
    for (const p of (profs ?? []) as Array<{ id: string; nama: string }>) petugas.set(p.id, p.nama);
  }

  // ---- unduh bukti dari bucket privat ----
  const fotoPer = new Map<string, Uint8Array>();
  const gagalUnduh: string[] = [];
  await petaTerbatas(berbukti, PARALEL, async (r) => {
    const path = r.bukti_transfer_path!;
    const { data: blob, error: errUnduh } = await admin.storage.from(BUKTI_BUCKET).download(path);
    if (errUnduh || !blob) {
      gagalUnduh.push(r.nama);
      return;
    }
    fotoPer.set(r.id, new Uint8Array(await blob.arrayBuffer()));
  });

  const baris: BarisFoto[] = rows.map((r) => ({
    nilai: [
      r.nomor_tt ?? "",
      r.nama,
      r.nama_hanzi ?? "",
      r.kelompok?.nama ?? "",
      r.alamat ?? "",
      r.kota_kabupaten ?? "",
      r.no_whatsapp ?? "",
      r.metode_bayar ?? "",
      Number(r.nominal_donasi ?? 0),
      formatTanggalWITA(r.registered_at),
      formatJamWITA(r.registered_at),
      r.created_by ? petugas.get(r.created_by) ?? "" : "",
    ],
    foto: fotoPer.get(r.id),
  }));

  const stream = buatXlsxBerfoto({ namaSheet: "Rekap Donasi", kolom: KOLOM, baris });

  const tgl = from || to ? `${from || "awal"}_${to || "akhir"}` : "semua";
  const namaBerkas = `rekap-donasi-bukti_${tgl}.xlsx`;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaBerkas}"`,
      // Beri tahu pemanggil bila ada bukti yang gagal diambil, tanpa
      // menggagalkan seluruh unduhan yang sudah berhasil dirangkai.
      ...(gagalUnduh.length ? { "X-Bukti-Gagal": String(gagalUnduh.length) } : {}),
      "Cache-Control": "no-store",
    },
  });
}
