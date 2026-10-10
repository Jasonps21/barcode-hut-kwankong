/*
 * Cadangan (backup) SELURUH isi tabel produksi ke file JSON.
 *
 * Dipakai sebagai jaring pengaman sebelum migrasi besar (multi-kegiatan).
 * Output: backup-produksi-<tanggal>/<nama_tabel>.json di root project
 *         (folder ini di-gitignore karena berisi data pribadi).
 *
 * Jalankan: node scripts/backup-produksi.cjs
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");

/** Tabel yang dicadangkan. Urutan tidak penting (tiap tabel file sendiri). */
const TABEL = [
  "kelompok",
  "profiles",
  "peserta",
  "peserta_nomor_usaha",
  "kupon",
  "jenis_usaha",
  "app_settings",
  "wa_log",
  "log_aktivitas",
  "error_logs",
];

function loadEnv() {
  const env = {};
  const file = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of file.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/**
 * PostgREST membatasi ~1000 baris per request, jadi ambil bertahap.
 * Urut berdasarkan `id` supaya paginasi stabil (tidak ada baris terlewat/dobel).
 */
async function ambilSemua(supabase, tabel, kolomUrut) {
  const PAGE = 1000;
  const semua = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(tabel)
      .select("*")
      .order(kolomUrut, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${tabel}: ${error.message}`);
    if (!data || data.length === 0) break;
    semua.push(...data);
    if (data.length < PAGE) break;
  }
  return semua;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(ROOT, `backup-produksi-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const ringkasan = {};
  for (const tabel of TABEL) {
    // app_settings memakai `key` sebagai primary key, sisanya `id`.
    const kolomUrut = tabel === "app_settings" ? "key" : "id";
    const rows = await ambilSemua(supabase, tabel, kolomUrut);
    fs.writeFileSync(path.join(outDir, `${tabel}.json`), JSON.stringify(rows, null, 2), "utf8");
    ringkasan[tabel] = rows.length;
    console.log(`  ${tabel.padEnd(22)} ${String(rows.length).padStart(6)} baris`);
  }

  fs.writeFileSync(
    path.join(outDir, "_ringkasan.json"),
    JSON.stringify({ diambil_pada: new Date().toISOString(), jumlah_baris: ringkasan }, null, 2),
    "utf8",
  );
  console.log(`\nSelesai. Tersimpan di: ${outDir}`);
}

main().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});
