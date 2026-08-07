/*
 * Rekap peserta yang BELUM menukar kupon (status kupon = 'assigned').
 *
 * Output: rekap-belum-tukar-<tanggal>.xlsx di root project.
 *   - Sheet "Belum Tukar" : 1 baris = 1 kupon, diurutkan berdasarkan nama peserta.
 *   - Sheet "Ringkasan"   : jumlah kupon belum tukar per buku.
 *
 * Jalankan: node scripts/export-belum-tukar.cjs
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const env = {};
  const file = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of file.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ambil semua kupon yang sudah dibagikan tapi belum ditukar (paginasi 1000/batch).
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("kupon")
      .select(
        "nomor_kupon, assigned_at, kelompok:kelompok_id(nama), peserta:peserta_id(nama, nama_hanzi, no_whatsapp, alamat)"
      )
      .eq("status", "assigned")
      .order("nomor_kupon")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const collator = new Intl.Collator("id", { sensitivity: "base", numeric: true });
  rows.sort((a, b) => {
    const n = collator.compare(a.peserta?.nama ?? "", b.peserta?.nama ?? "");
    return n !== 0 ? n : collator.compare(a.nomor_kupon, b.nomor_kupon);
  });

  const sheet = rows.map((r, i) => ({
    No: i + 1,
    Nama: r.peserta?.nama ?? "(tanpa peserta)",
    "Nama Hanzi": r.peserta?.nama_hanzi ?? "",
    Buku: r.kelompok?.nama ?? "",
    "Nomor Kupon (Barcode)": r.nomor_kupon,
    "No WhatsApp": r.peserta?.no_whatsapp ?? "",
    Alamat: r.peserta?.alamat ?? "",
  }));

  const perBuku = new Map();
  for (const r of rows) {
    const b = r.kelompok?.nama ?? "(tanpa buku)";
    perBuku.set(b, (perBuku.get(b) ?? 0) + 1);
  }
  const pesertaUnik = new Set(rows.map((r) => r.peserta?.nama ?? "-")).size;
  const ringkasan = [...perBuku.entries()]
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(([Buku, n]) => ({ Buku, "Kupon Belum Tukar": n }));
  ringkasan.push({ Buku: "TOTAL", "Kupon Belum Tukar": rows.length });
  ringkasan.push({ Buku: "Jumlah peserta (nama unik)", "Kupon Belum Tukar": pesertaUnik });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheet);
  ws["!cols"] = [
    { wch: 5 },
    { wch: 32 },
    { wch: 14 },
    { wch: 30 },
    { wch: 22 },
    { wch: 16 },
    { wch: 40 },
  ];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet.length, c: 6 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, "Belum Tukar");

  const wsR = XLSX.utils.json_to_sheet(ringkasan);
  wsR["!cols"] = [{ wch: 34 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsR, "Ringkasan");

  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(ROOT, `rekap-belum-tukar-${stamp}.xlsx`);
  XLSX.writeFile(wb, out);

  console.log(`${rows.length} kupon belum ditukar (${pesertaUnik} nama peserta).`);
  for (const r of ringkasan) console.log(`  ${r.Buku}: ${r["Kupon Belum Tukar"]}`);
  console.log(`\nTersimpan: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
