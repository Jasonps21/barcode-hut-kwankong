/**
 * Bunyi umpan balik untuk layar konter (/scan).
 *
 * Nada dibangkitkan lewat Web Audio, bukan berkas audio: tidak ada aset yang
 * harus diunduh di lokasi acara yang sinyalnya seadanya, dan tidak ada jeda
 * muat pada bunyi pertama — yang justru paling penting, karena bunyi pertama
 * terjadi saat antrian baru mulai.
 *
 * Berhasil dan gagal sengaja dibedakan bentuknya, bukan cuma tingginya: nada
 * naik pendek untuk berhasil, dua nada rendah berulang untuk gagal. Di konter
 * yang ramai, beda tinggi nada saja sering tidak terdengar, tapi beda pola
 * masih tertangkap.
 */

const KUNCI_SETELAN = "scan:bunyi";

let ctx: AudioContext | null = null;

type WindowDenganWebkit = Window & { webkitAudioContext?: typeof AudioContext };

function ambilContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Konstruktor = window.AudioContext ?? (window as WindowDenganWebkit).webkitAudioContext;
  if (!Konstruktor) return null;
  if (!ctx) ctx = new Konstruktor();
  return ctx;
}

/** Satu nada dengan amplop naik-turun singkat, supaya tidak terdengar "klik"
 *  di awal dan akhir seperti oscillator yang dimatikan mentah. */
function nada(ac: AudioContext, hz: number, mulai: number, durasi: number, keras: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;

  gain.gain.setValueAtTime(0, mulai);
  gain.gain.linearRampToValueAtTime(keras, mulai + 0.012);
  gain.gain.setValueAtTime(keras, mulai + durasi - 0.03);
  gain.gain.linearRampToValueAtTime(0, mulai + durasi);

  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(mulai);
  osc.stop(mulai + durasi);
}

export type JenisBunyi = "berhasil" | "gagal";

/**
 * Membunyikan umpan balik. Aman dipanggil kapan saja: bila browser tidak
 * mengizinkan audio (belum ada interaksi pengguna, tab dibisukan, perangkat
 * tanpa Web Audio), fungsi ini diam saja dan tidak pernah melempar error —
 * bunyi hanyalah pelengkap, layar tetap sumber kebenarannya.
 */
export function bunyikan(jenis: JenisBunyi): void {
  try {
    const ac = ambilContext();
    if (!ac) return;
    // Browser mobile menaruh AudioContext di status "suspended" sampai ada
    // interaksi. Petugas selalu sudah menekan sesuatu (PIN, tombol scanner)
    // sebelum kupon pertama masuk, jadi resume() di sini praktis selalu jalan.
    if (ac.state === "suspended") void ac.resume();

    const t = ac.currentTime;
    if (jenis === "berhasil") {
      // Naik pendek: terdengar seperti "selesai".
      nada(ac, 880, t, 0.07, 0.22);
      nada(ac, 1318, t + 0.07, 0.11, 0.22);
    } else {
      // Dua nada rendah berjarak: pola yang tidak mungkin tertukar dengan
      // bunyi berhasil, bahkan kalau hanya terdengar sepintas.
      nada(ac, 233, t, 0.15, 0.28);
      nada(ac, 196, t + 0.2, 0.24, 0.28);
    }
  } catch {
    // Sengaja dibiarkan: kegagalan audio tidak boleh mengganggu penukaran.
  }
}

/* ---------------------------------------------------------------------------
 * Setelan bunyi
 *
 * Disimpan di perangkat masing-masing petugas, bukan di server: tiap konter
 * punya kondisi keramaian sendiri. Dibungkus sebagai store langganan supaya
 * komponen bisa memakainya lewat useSyncExternalStore — membaca localStorage
 * langsung saat render akan berbeda antara server dan klien (hydration
 * mismatch), dan menambalnya dengan setState di useEffect memicu render
 * bertingkat yang tidak perlu.
 * ------------------------------------------------------------------------- */

const pendengar = new Set<() => void>();

/** Nilai di-cache supaya getSnapshot murah dan stabil dipanggil tiap render. */
let setelan: boolean | null = null;

export function bacaSetelanBunyi(): boolean {
  if (typeof window === "undefined") return true;
  if (setelan === null) {
    try {
      setelan = window.localStorage.getItem(KUNCI_SETELAN) !== "off";
    } catch {
      setelan = true;
    }
  }
  return setelan;
}

/** Nilai saat render di server: bunyi dianggap menyala, sesuai default. */
export function setelanBunyiAwal(): boolean {
  return true;
}

export function langgananSetelanBunyi(ubah: () => void): () => void {
  pendengar.add(ubah);
  return () => {
    pendengar.delete(ubah);
  };
}

export function simpanSetelanBunyi(nyala: boolean): void {
  setelan = nyala;
  try {
    window.localStorage.setItem(KUNCI_SETELAN, nyala ? "on" : "off");
  } catch {
    // Mode penyamaran / storage penuh — setelan tidak persisten lintas sesi,
    // tapi tombolnya tetap berfungsi untuk sesi ini karena cache di atas
    // sudah diperbarui lebih dulu.
  }
  for (const ubah of pendengar) ubah();
}
