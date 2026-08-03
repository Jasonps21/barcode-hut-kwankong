/**
 * Tes perilaku penukaran kupon (konkurensi + penukaran sebagian).
 *
 *   node scripts/test-race-redeem.cjs [jumlah_paralel]
 *
 * Skenario:
 *   1. Race satu kupon  — pola lama vs pola baru, N permintaan serentak.
 *   2. Race batch       — dua konter mengirim 10 kupon yang sama bersamaan.
 *   3. Sebagian         — punya 10, tukar 3 dulu, sisa 7 ditukar belakangan.
 *
 * Semua kupon uji sintetis (nomor "TESTRACE-...") dan dihapus lagi setelah
 * dipakai, jadi tidak ada data acara yang tersentuh.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

// --- env ------------------------------------------------------------------
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Tidak menemukan .env.local di root proyek.");
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum ada di .env.local.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const N = Number(process.argv[2]) || 10;
const PREFIX = "TESTRACE-";

// --- implementasi yang diuji ---------------------------------------------

/** Pola LAMA: baca dulu, lalu tulis. Guard `.eq("status")` ada di UPDATE, tapi
 *  hasilnya tidak pernah dibaca — 0 baris terpengaruh tetap dianggap sukses. */
async function redeemLama(kuponId) {
  const { data: existing } = await admin
    .from("kupon").select("status").eq("id", kuponId).single();
  if (!existing) return { ok: false, error: "Kupon tidak ditemukan." };
  if (existing.status === "redeemed") return { ok: false, error: "Kupon sudah ditukar." };
  if (existing.status !== "assigned") return { ok: false, error: "Kupon belum diasosiasikan." };

  const { error } = await admin
    .from("kupon")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("id", kuponId)
    .eq("status", "assigned");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Pola BARU, versi banyak kupon. Harus cerminan dari redeemKupons() di
 *  src/app/scan/actions.ts — kalau yang di sana berubah, ubah juga di sini. */
async function redeemBatch(kuponIds) {
  const ids = [...new Set(kuponIds.filter(Boolean))];
  if (!ids.length) return { ok: false, berhasil: [], error: "Belum ada kupon yang discan." };

  const { data, error } = await admin
    .from("kupon")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "assigned")
    .select("id, nomor_kupon");
  if (error) return { ok: false, berhasil: [], error: error.message };

  const berhasil = data ?? [];
  return { ok: berhasil.length > 0, berhasil };
}

const redeemBaru = async (id) => {
  const r = await redeemBatch([id]);
  return { ok: r.ok, error: r.ok ? undefined : "Kupon sudah ditukar." };
};

// --- harness --------------------------------------------------------------
async function buatKupon(jumlah = 1) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  const rows = Array.from({ length: jumlah }, (_, i) => ({
    nomor_kupon: `${PREFIX}${tag}-${String(i + 1).padStart(2, "0")}`,
    status: "assigned",
  }));
  const { data, error } = await admin.from("kupon").insert(rows).select("id, nomor_kupon").order("nomor_kupon");
  if (error) throw new Error(`Gagal membuat kupon uji: ${error.message}`);
  return data;
}

async function hapus(kupons) {
  await admin.from("kupon").delete().in("id", kupons.map((k) => k.id));
}

async function statusDari(kupons) {
  const { data } = await admin.from("kupon").select("id, status").in("id", kupons.map((k) => k.id));
  return Object.fromEntries((data ?? []).map((r) => [r.id, r.status]));
}

function lapor(lulus, teks) {
  console.log(`  ${lulus ? "LULUS" : "GAGAL"} — ${teks}`);
  return lulus;
}

// --- skenario -------------------------------------------------------------

/** Satu percobaan: `konkuren` permintaan serentak ke satu kupon. */
async function satuPercobaan(fn, konkuren) {
  const [kupon] = await buatKupon(1);
  try {
    const hasil = await Promise.all(
      Array.from({ length: konkuren }, () => fn(kupon.id).catch(() => ({ ok: false }))),
    );
    return hasil.filter((r) => r.ok).length;
  } finally {
    await hapus([kupon]);
  }
}

/**
 * Diuji pada 2 permintaan serentak, bukan hanya serbuan besar.
 *
 * Ini penting: dengan puluhan permintaan sekaligus, PostgREST cenderung
 * mengantrekannya di satu koneksi sehingga SELECT-SELECT berikutnya sudah
 * melihat hasil UPDATE yang pertama — race-nya tertutup secara kebetulan dan
 * pola yang bocor pun terlihat "lulus". Dua panitia menekan tombol bersamaan
 * justru benar-benar berjalan paralel, dan itulah kondisi di lapangan.
 */
async function skenarioRaceTunggal(nama, fn) {
  const ULANG = 15;
  let bocor = 0;
  for (let i = 0; i < ULANG; i++) {
    if ((await satuPercobaan(fn, 2)) > 1) bocor++;
  }
  const serbuan = await satuPercobaan(fn, N);

  console.log(`\n[1. RACE SATU KUPON — ${nama}]`);
  console.log(`  2 serentak, ${ULANG}x  : ${bocor} percobaan meloloskan penukaran ganda`);
  console.log(`  ${String(N).padEnd(2)} serentak, 1x   : ${serbuan} penukaran diterima`);
  return lapor(bocor === 0 && serbuan === 1, `${bocor} kebocoran pada uji 2-panitia (harus 0)`);
}

async function skenarioRaceBatch() {
  const kupons = await buatKupon(10);
  try {
    const ids = kupons.map((k) => k.id);
    // Dua konter mengirim daftar 10 kupon yang sama persis, bersamaan.
    const [a, b] = await Promise.all([redeemBatch(ids), redeemBatch(ids)]);
    const total = a.berhasil.length + b.berhasil.length;
    console.log(`\n[2. RACE BATCH] dua konter mengirim 10 kupon yang sama bersamaan`);
    console.log(`  konter A: ${a.berhasil.length} kupon   konter B: ${b.berhasil.length} kupon`);
    return lapor(total === 10, `total ${total} penukaran (harus tepat 10, bukan 20)`);
  } finally {
    await hapus(kupons);
  }
}

async function skenarioSebagian() {
  const kupons = await buatKupon(10);
  try {
    console.log(`\n[3. PENUKARAN SEBAGIAN] punya 10 kupon`);

    const gelombang1 = kupons.slice(0, 3);
    const r1 = await redeemBatch(gelombang1.map((k) => k.id));
    const st1 = await statusDari(kupons);
    const ditukar1 = Object.values(st1).filter((s) => s === "redeemed").length;
    const sisa1 = Object.values(st1).filter((s) => s === "assigned").length;
    console.log(`  scan 3 dulu  → ditukar ${r1.berhasil.length}, sisa "assigned" ${sisa1}`);
    const ok1 = r1.berhasil.length === 3 && ditukar1 === 3 && sisa1 === 7;
    if (!lapor(ok1, "3 ditukar, 7 tetap bisa ditukar nanti")) return false;

    const gelombang2 = kupons.slice(3);
    const r2 = await redeemBatch(gelombang2.map((k) => k.id));
    const st2 = await statusDari(kupons);
    const sisa2 = Object.values(st2).filter((s) => s === "assigned").length;
    console.log(`  lalu scan 7  → ditukar ${r2.berhasil.length}, sisa "assigned" ${sisa2}`);
    const ok2 = r2.berhasil.length === 7 && sisa2 === 0;
    if (!lapor(ok2, "7 sisanya berhasil ditukar belakangan")) return false;

    // Kupon yang sudah habis tidak boleh bisa ditukar lagi.
    const r3 = await redeemBatch(kupons.map((k) => k.id));
    console.log(`  scan ulang   → ditukar ${r3.berhasil.length}`);
    return lapor(r3.berhasil.length === 0, "penukaran ulang ditolak seluruhnya");
  } finally {
    await hapus(kupons);
  }
}

// --- main -----------------------------------------------------------------
(async () => {
  // Sapu sisa dari eksekusi yang mungkin terputus sebelum sempat bersih-bersih.
  await admin.from("kupon").delete().like("nomor_kupon", `${PREFIX}%`);

  console.log(`Tes penukaran kupon — ${N} permintaan paralel untuk skenario race.`);
  const lama = await skenarioRaceTunggal("POLA LAMA", redeemLama);
  const baru = await skenarioRaceTunggal("POLA BARU", redeemBaru);
  const batch = await skenarioRaceBatch();
  const sebagian = await skenarioSebagian();

  console.log("\n─────────────────────────────────────────────");
  console.log(lama
    ? "Pola lama kebetulan lolos kali ini — race tidak selalu kena; ulangi dengan N lebih besar."
    : "Pola lama meloloskan penukaran ganda (sesuai dugaan).");

  const semuaLulus = baru && batch && sebagian;
  console.log(semuaLulus ? "Pola baru: semua skenario LULUS." : "Pola baru: ADA YANG GAGAL — periksa di atas.");
  process.exit(semuaLulus ? 0 : 1);
})().catch(async (e) => {
  console.error("\nError:", e.message);
  try { await admin.from("kupon").delete().like("nomor_kupon", `${PREFIX}%`); } catch {}
  process.exit(1);
});
