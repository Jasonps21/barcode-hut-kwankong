/*
 * Import peserta dari "5 BUKU KWAN KONG SHEN TAN 2026 landscape GABUNG.xlsx".
 *
 * - 1 sheet = 1 kelompok (BUKU 1..5, BUKU LUAR KOTA).
 * - Kolom yang diambil: NAMA/TOKO, NAMA HAN ZI, ALAMAT, HP.
 * - Pinyin diisi dari kolom PIN YIN bila ada, kalau kosong digenerate dari Hanzi.
 * - Baris dilewati hanya jika SELURUH kolom data (nama/hanzi/alamat/hp) kosong.
 *
 * Jalankan: node scripts/import-peserta.cjs           (live insert)
 *           node scripts/import-peserta.cjs --dry-run  (tanpa menulis ke DB)
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { pinyin } = require("pinyin-pro");
const { createClient } = require("@supabase/supabase-js");

const DRY = process.argv.includes("--dry-run");
const ROOT = path.resolve(__dirname, "..");
const XLSX_FILE = "5 BUKU KWAN KONG SHEN TAN 2026 landscape GABUNG.xlsx";

// ---- env ----
function loadEnv() {
  const env = {};
  const file = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of file.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

// ---- helpers ----
function clean(v) {
  return String(v ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function hasHanzi(t) {
  return /[㐀-䶿一-鿿豈-﫿]/.test(t || "");
}
function toPinyin(hanzi) {
  const src = clean(hanzi);
  if (!src || !hasHanzi(src)) return "";
  return pinyin(src, { toneType: "symbol", type: "array", nonZh: "consecutive" })
    .map((s) => cap(s.trim()))
    .filter(Boolean)
    .join(" ");
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const wb = XLSX.readFile(path.join(ROOT, XLSX_FILE));
  let grandTotal = 0;
  const summary = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });

    // Build peserta dari baris data (skip header di index 0)
    const peserta = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const nama = clean(r[1]);
      const namaHanzi = clean(r[2]);
      const pinyinXls = clean(r[3]);
      const alamat = clean(r[4]);
      const noHp = clean(r[5]);

      // Lewati hanya jika SEMUA kolom data kosong
      if (!nama && !namaHanzi && !alamat && !noHp) continue;

      const pinyinVal = pinyinXls || toPinyin(namaHanzi);
      peserta.push({
        // nama wajib (NOT NULL) -> fallback ke pinyin/hanzi bila kolom nama kosong
        nama: nama || pinyinVal || namaHanzi || "(tanpa nama)",
        nama_hanzi: namaHanzi || null,
        pinyin: pinyinVal || null,
        alamat: alamat || "",
        no_whatsapp: noHp || "",
        nominal_donasi: 0,
        wa_status: "not_sent",
      });
    }

    // ---- kelompok (cari yang sudah ada, kalau belum buat) ----
    let kelompokId = null;
    if (!DRY) {
      const { data: existing } = await sb.from("kelompok").select("id").eq("nama", sheetName).maybeSingle();
      if (existing) {
        kelompokId = existing.id;
      } else {
        // prefix punya unique constraint & dipakai utk penomoran kupon. Kelompok
        // hasil impor belum punya kupon, jadi prefix di-set unik dari nama sheet.
        const { data: created, error } = await sb
          .from("kelompok")
          .insert({ nama: sheetName, prefix: sheetName, range_start: 0, range_end: 0, padding: 0 })
          .select("id")
          .single();
        if (error) throw new Error(`Gagal buat kelompok "${sheetName}": ${error.message}`);
        kelompokId = created.id;
      }

      // Idempoten: bersihkan peserta lama kelompok ini sebelum insert ulang
      // (aman karena peserta impor belum punya kupon ter-assign).
      const { error: delErr } = await sb.from("peserta").delete().eq("kelompok_id", kelompokId);
      if (delErr) throw new Error(`Gagal bersihkan peserta lama "${sheetName}": ${delErr.message}`);
    }

    // ---- insert peserta (chunk 500) ----
    if (!DRY && peserta.length) {
      const withKelompok = peserta.map((p) => ({ ...p, kelompok_id: kelompokId }));
      const CHUNK = 500;
      for (let i = 0; i < withKelompok.length; i += CHUNK) {
        const { error } = await sb.from("peserta").insert(withKelompok.slice(i, i + CHUNK));
        if (error) throw new Error(`Gagal insert peserta "${sheetName}": ${error.message}`);
      }
    }

    grandTotal += peserta.length;
    summary.push({ sheet: sheetName, peserta: peserta.length, kelompokId });
    console.log(`${DRY ? "[DRY] " : ""}${sheetName}: ${peserta.length} peserta`);
  }

  console.log("\n=== RINGKASAN ===");
  console.table(summary);
  console.log(`TOTAL peserta: ${grandTotal}${DRY ? " (dry-run, tidak ditulis)" : " (tersimpan)"}`);
}

main().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});
