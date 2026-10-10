/*
 * Ubah hasil backup JSON menjadi satu berkas SQL berisi INSERT, supaya bisa
 * dimuat ke Postgres lokal lewat psql tanpa menambah dependensi baru.
 *
 * Jalankan: node scripts/lokal-01-buat-seed.cjs [folder-backup]
 * Keluaran: <folder-backup>/seed-lokal.sql
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/** Urutan penting: tabel induk dulu, supaya foreign key tidak melanggar. */
const URUTAN = [
  { tabel: "kelompok", kolom: ["id", "nama", "prefix", "range_start", "range_end", "padding", "created_at"] },
  { tabel: "profiles", kolom: ["id", "nama", "role", "kelompok_id", "created_at", "can_edit_peserta", "can_delete_peserta"] },
  { tabel: "jenis_usaha", kolom: ["id", "nama", "created_at"] },
  {
    tabel: "peserta",
    kolom: [
      "id", "nama", "alamat", "no_whatsapp", "nominal_donasi", "kelompok_id",
      "wa_status", "wa_sent_at", "wa_attempt_count", "created_at", "created_by",
      "nama_hanzi", "pinyin", "metode_bayar", "bukti_transfer_path",
      "registered_at", "nomor_tt", "kota_kabupaten", "provinsi",
      "jenis_usaha_id", "keterangan",
    ],
  },
  { tabel: "kupon", kolom: ["id", "nomor_kupon", "kelompok_id", "status", "peserta_id", "assigned_at", "assigned_by", "redeemed_at", "redeemed_by"] },
  { tabel: "peserta_nomor_usaha", kolom: ["id", "peserta_id", "label", "nomor", "sama_dengan_wa", "urutan", "created_at"] },
];

/** Kutip nilai jadi literal SQL. Kutip tunggal digandakan sesuai aturan SQL. */
function literal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function cariFolderBackup(arg) {
  if (arg) return path.resolve(ROOT, arg);
  const kandidat = fs.readdirSync(ROOT).filter((n) => n.startsWith("backup-produksi-")).sort();
  if (!kandidat.length) throw new Error("Folder backup-produksi-* tidak ditemukan. Jalankan dulu: node scripts/backup-produksi.cjs");
  return path.join(ROOT, kandidat[kandidat.length - 1]);
}

function main() {
  const dir = cariFolderBackup(process.argv[2]);
  const keluar = path.join(dir, "seed-lokal.sql");
  const bagian = ["-- Seed data uji dari salinan produksi. JANGAN dijalankan di produksi.", "begin;"];

  for (const { tabel, kolom } of URUTAN) {
    const berkas = path.join(dir, `${tabel}.json`);
    if (!fs.existsSync(berkas)) {
      console.warn(`  lewati ${tabel} (file tidak ada)`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(berkas, "utf8"));
    bagian.push(`\n-- ${tabel}: ${rows.length} baris`);

    // Pecah jadi beberapa INSERT supaya satu pernyataan tidak terlalu panjang.
    const UKURAN = 200;
    for (let i = 0; i < rows.length; i += UKURAN) {
      const potongan = rows.slice(i, i + UKURAN);
      const nilai = potongan
        .map((r) => "(" + kolom.map((k) => literal(r[k])).join(",") + ")")
        .join(",\n  ");
      bagian.push(
        `insert into public.${tabel} (${kolom.join(", ")}) values\n  ${nilai}\non conflict (id) do nothing;`,
      );
    }
    console.log(`  ${tabel.padEnd(22)} ${String(rows.length).padStart(6)} baris`);
  }

  bagian.push("\ncommit;");
  fs.writeFileSync(keluar, bagian.join("\n"), "utf8");
  console.log(`\nSelesai: ${keluar}`);
}

main();
