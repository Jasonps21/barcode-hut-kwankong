import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Direktori ini tidak dilindungi login, jadi query-nya sengaja hanya menyentuh
 *  kolom yang memang ditujukan untuk publik: nama usaha, jenis, alamat, dan
 *  nomor usaha milik anggota aktif. Tabel setoran & kupon tidak pernah disentuh. */

export interface NomorUsaha {
  label: string | null;
  nomor: string;
}

export interface UsahaRow {
  id: string;
  nama: string;
  alamat: string;
  kota_kabupaten: string | null;
  provinsi: string | null;
  keterangan: string | null;
  jenis_usaha: { nama: string } | null;
  anggota_nomor_usaha: NomorUsaha[];
}

export interface Kategori {
  nama: string;
  jumlah: number;
  rona: WarnaKategori;
}

/** Beberapa usaha nyata untuk ditampilkan di hero sebagai tumpukan kartu yang
 *  berganti sendiri. Sengaja tanpa id: kartunya menaut ke pencarian nama, jadi
 *  id tidak pernah dipakai, dan mengambilnya berarti menyeret satu UUID per
 *  baris untuk seluruh direktori tanpa alasan. */
export interface Sorotan {
  nama: string;
  jenis: string | null;
  kota: string | null;
  rona: WarnaKategori;
}

/** Sebanyak ini usaha diambil untuk digilir di hero. Tiga kartu terlihat
 *  sekaligus; sisanya antre di belakang. Lebih dari ini tidak menambah apa pun
 *  karena satu putaran penuh sudah lewat dari setengah menit. */
const JUMLAH_SOROTAN = 9;

export interface Ringkasan {
  /** Diurutkan dari yang paling banyak isinya, supaya kategori kosong jatuh ke belakang. */
  kategori: Kategori[];
  totalUsaha: number;
  totalKota: number;
  sorotan: Sorotan[];
}

/** Enam rona lembut untuk menandai kategori. Bukan hiasan: satu kategori selalu
 *  memakai rona yang sama, jadi warga lama hafal titik mana yang dituju.
 *
 *  Rona dibagikan menurut urutan abjad, bukan hasil hash dari namanya. Hash
 *  memang kebal terhadap perubahan daftar, tapi sebarannya menggumpal: pernah
 *  keluar empat titik oranye berderet dalam satu baris, dan warna berhenti
 *  berfungsi sebagai pembeda. Urutan abjad menjamin enam rona bergilir rata.
 *  Konsekuensinya, menambah jenis usaha baru bisa menggeser rona sesudahnya. */
const WARNA_KATEGORI = ["daun", "langit", "persik", "teal", "lemon", "ungu"] as const;

export type WarnaKategori = (typeof WARNA_KATEGORI)[number];

function ronaKe(index: number): WarnaKategori {
  return WARNA_KATEGORI[index % WARNA_KATEGORI.length];
}

const STOPWORDS = new Set([
  "di", "ke", "dari", "dan", "yang", "untuk", "atau",
  "kota", "kab", "kabupaten", "kec", "kecamatan", "provinsi", "prov", "daerah", "wilayah",
]);

function tokenize(input: string): string[] {
  const words = input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  return meaningful.length ? meaningful : words;
}

export async function ambilRingkasan(): Promise<Ringkasan> {
  const admin = createAdminClient();

  const [jenisRes, pesertaRes] = await Promise.all([
    admin.from("jenis_usaha").select("id, nama").order("nama"),
    admin
      .from("anggota")
      .select("nama, jenis_usaha_id, kota_kabupaten")
      .eq("aktif", true)
      .not("jenis_usaha_id", "is", null)
      // Batas bawaan PostgREST 1000 baris; direktori bisa lewat angka itu dan
      // hitungannya akan diam-diam salah kalau tidak dinaikkan.
      .limit(20000),
  ]);

  const jenis = (jenisRes.data ?? []) as { id: string; nama: string }[];
  const peserta = (pesertaRes.data ?? []) as {
    nama: string | null;
    jenis_usaha_id: string | null;
    kota_kabupaten: string | null;
  }[];

  // Sorotan hero diambil dari baris yang sudah ada di tangan, bukan lewat
  // query keempat. Yang dipakai reservoir sampling: satu lewatan, tanpa
  // menyalin atau mengacak seluruh direktori, dan tiap usaha punya peluang
  // sama untuk tampil — termasuk yang namanya berawalan Z. Query terpisah
  // dengan `order(nama).limit(9)` selalu memunculkan sembilan nama yang sama
  // seumur hidup direktori.
  const cadangan: typeof peserta = [];
  let layak = 0;

  const perJenis = new Map<string, number>();
  const kota = new Set<string>();
  for (const p of peserta) {
    if (p.jenis_usaha_id) perJenis.set(p.jenis_usaha_id, (perJenis.get(p.jenis_usaha_id) ?? 0) + 1);
    const k = p.kota_kabupaten?.trim();
    if (k) kota.add(k.toLowerCase());

    if (!p.nama?.trim()) continue;
    layak += 1;
    if (cadangan.length < JUMLAH_SOROTAN) {
      cadangan.push(p);
    } else {
      const j = Math.floor(Math.random() * layak);
      if (j < JUMLAH_SOROTAN) cadangan[j] = p;
    }
  }

  // Rona ditetapkan dari urutan abjad supaya stabil, lalu daftarnya diurut
  // ulang menurut jumlah isi untuk ditampilkan. Dua urutan yang berbeda dan
  // memang disengaja: yang satu menentukan warna, yang satu menentukan posisi.
  const kategori = jenis
    .map((j, i) => ({ nama: j.nama, jumlah: perJenis.get(j.id) ?? 0, rona: ronaKe(i) }))
    .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, "id"));

  const ronaPerJenis = new Map(jenis.map((j, i) => [j.id, ronaKe(i)]));
  const namaJenis = new Map(jenis.map((j) => [j.id, j.nama]));
  const sorotan: Sorotan[] = cadangan.map((p) => ({
    nama: p.nama!.trim(),
    jenis: (p.jenis_usaha_id && namaJenis.get(p.jenis_usaha_id)) || null,
    kota: p.kota_kabupaten,
    rona: (p.jenis_usaha_id && ronaPerJenis.get(p.jenis_usaha_id)) || "daun",
  }));

  return { kategori, totalUsaha: peserta.length, totalKota: kota.size, sorotan };
}

export async function cariUsaha(q: string): Promise<UsahaRow[]> {
  if (!q) return [];
  const admin = createAdminClient();
  const tokens = tokenize(q);

  let query = admin
    .from("anggota")
    .select(
      "id, nama, alamat, kota_kabupaten, provinsi, keterangan, jenis_usaha(nama), anggota_nomor_usaha(label, nomor)",
    )
    .eq("aktif", true)
    .not("jenis_usaha_id", "is", null);

  // Setiap kata harus cocok di suatu tempat (AND antar kata, OR antar kolom per kata) —
  // supaya "furniture makassar" menemukan yang jenis usahanya Furniture DAN lokasinya Makassar.
  for (const token of tokens) {
    const like = `%${token}%`;
    const { data: jenisUsahaMatch } = await admin.from("jenis_usaha").select("id").ilike("nama", like);
    const jenisUsahaIds = (jenisUsahaMatch ?? []).map((j) => j.id as string);

    const orParts = [
      `keterangan.ilike.${like}`,
      `nama.ilike.${like}`,
      `alamat.ilike.${like}`,
      `kota_kabupaten.ilike.${like}`,
      `provinsi.ilike.${like}`,
    ];
    if (jenisUsahaIds.length) orParts.push(`jenis_usaha_id.in.(${jenisUsahaIds.join(",")})`);

    query = query.or(orParts.join(","));
  }

  const { data } = await query
    .order("nama")
    .order("urutan", { referencedTable: "anggota_nomor_usaha" })
    .limit(100);

  return (data ?? []) as unknown as UsahaRow[];
}
