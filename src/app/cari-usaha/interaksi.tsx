"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn, Search, X } from "lucide-react";

/** Semua gerak berkelanjutan (kursor, ketikan, angka berjalan) ditulis langsung
 *  ke DOM lewat ref, bukan lewat useState. Menyimpan nilai per-frame di state
 *  akan me-render ulang seluruh daftar hasil setiap kali nilainya berubah. */

const KURANGI_GERAK = "(prefers-reduced-motion: reduce)";

function gerakDikurangi() {
  return typeof window !== "undefined" && window.matchMedia(KURANGI_GERAK).matches;
}

/* ------------------------------------------------------------------ */
/* Kotak pencarian                                                      */
/* ------------------------------------------------------------------ */

export function KotakCari({
  nilaiAwal,
  contoh = [],
  ringkas = false,
}: {
  nilaiAwal: string;
  contoh?: string[];
  ringkas?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);

  // Fokus otomatis hanya di layar lebar. Di ponsel, memaksa fokus akan langsung
  // memunculkan keyboard dan menutup separuh halaman sebelum sempat dibaca.
  useEffect(() => {
    if (ringkas) return;
    const el = inputRef.current;
    if (!el) return;
    if (window.matchMedia("(min-width: 1024px)").matches && !el.value) el.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const aktif = document.activeElement;
      if (aktif instanceof HTMLInputElement || aktif instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      el.scrollIntoView({ block: "center" });
      el.focus();
      el.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ringkas]);

  // Placeholder mengetik sendiri, bergilir dari nama kategori yang benar-benar
  // ada. Tujuannya mengajarkan apa saja yang bisa dicari, bukan sekadar ramai:
  // banyak warga tidak sadar alamat dan kota juga terindeks.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || ringkas || contoh.length === 0 || gerakDikurangi()) return;

    const awalan = "Cari ";
    let kata = 0;
    let huruf = 0;
    let hapus = false;
    let timer = 0;

    const jalan = () => {
      if (el.value || document.activeElement === el) {
        // Jangan ganggu saat sedang dipakai; cek lagi sebentar kemudian.
        timer = window.setTimeout(jalan, 900);
        return;
      }
      const target = contoh[kata % contoh.length];
      huruf += hapus ? -1 : 1;
      el.placeholder = awalan + target.slice(0, huruf) + (hapus ? "" : "│");

      let jeda = hapus ? 32 : 62;
      if (!hapus && huruf === target.length) {
        hapus = true;
        jeda = 1500;
      } else if (hapus && huruf === 0) {
        hapus = false;
        kata += 1;
        jeda = 320;
      }
      timer = window.setTimeout(jalan, jeda);
    };

    timer = window.setTimeout(jalan, 900);
    return () => {
      window.clearTimeout(timer);
      el.placeholder = "Furniture, laundry, nama toko, kota...";
    };
  }, [contoh, ringkas]);

  // GERAK 3 — tombol Cari tertarik pelan ke arah kursor saat didekati. Aksi
  // utama halaman jadi terasa hidup sebelum disentuh. Maksimal 6px; lebih dari
  // itu tombolnya malah sulit dikenai.
  useEffect(() => {
    const btn = tombolRef.current;
    if (!btn || ringkas || gerakDikurangi() || !window.matchMedia("(hover: hover)").matches) return;

    const area = btn.closest<HTMLElement>(".cu-cari");
    if (!area) return;

    let raf = 0;
    let x = 0;
    let y = 0;
    const tulis = () => {
      raf = 0;
      btn.style.setProperty("--tarik-x", `${x}px`);
      btn.style.setProperty("--tarik-y", `${y}px`);
    };
    const jadwalkan = () => {
      if (!raf) raf = requestAnimationFrame(tulis);
    };
    const onMove = (e: PointerEvent) => {
      const r = btn.getBoundingClientRect();
      x = Math.max(-6, Math.min(6, (e.clientX - (r.left + r.width / 2)) * 0.18));
      y = Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) * 0.18));
      jadwalkan();
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      jadwalkan();
    };

    area.addEventListener("pointermove", onMove, { passive: true });
    area.addEventListener("pointerleave", onLeave);
    return () => {
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ringkas]);

  function pindah(nilai: string) {
    const tujuan = nilai ? `/cari-usaha?q=${encodeURIComponent(nilai)}` : "/cari-usaha";
    startTransition(() => router.push(tujuan));
  }

  return (
    <form
      action="/cari-usaha"
      method="get"
      // Hanya kotak utama yang jadi penanda pencarian; yang ringkas di navigasi
      // adalah salinannya, dan dua landmark search sekaligus membingungkan
      // pembaca layar.
      role={ringkas ? undefined : "search"}
      className={ringkas ? "cu-cari cu-cari-ringkas" : "cu-cari"}
      data-pending={pending ? "" : undefined}
      onSubmit={(e) => {
        // Navigasi sisi klien supaya kerangka hasil sempat muncul. Tanpa JS,
        // submit GET bawaan tetap bekerja ke alamat yang sama.
        e.preventDefault();
        pindah((inputRef.current?.value ?? "").trim());
      }}
    >
      <Search className="cu-cari-ikon" strokeWidth={1.75} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        name="q"
        defaultValue={nilaiAwal}
        placeholder={ringkas ? "Cari lagi..." : "Furniture, laundry, nama toko, kota..."}
        className="cu-cari-input"
        aria-label={ringkas ? "Cari usaha, kotak ringkas" : "Kata kunci pencarian usaha"}
        autoComplete="off"
        enterKeyHint="search"
      />
      {!ringkas && (
        <kbd className="cu-cari-kbd" aria-hidden="true">
          /
        </kbd>
      )}
      <button
        type="button"
        className="cu-cari-hapus"
        aria-label="Kosongkan kata kunci"
        onClick={() => {
          const el = inputRef.current;
          if (!el) return;
          el.value = "";
          el.focus();
          pindah("");
        }}
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button ref={tombolRef} type="submit" className="cu-cari-submit">
        {pending ? (
          <LoaderCircle className="h-4 w-4 cu-berputar" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Search className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        )}
        <span className="cu-cari-submit-teks">Cari</span>
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Kepala halaman: melekat, dan menumbuhkan kotak cari saat digulir     */
/* ------------------------------------------------------------------ */

export function Kepala({
  namaKegiatan,
  nilaiAwal,
}: {
  namaKegiatan: string;
  nilaiAwal: string;
}) {
  const [ringkas, setRingkas] = useState(false);

  // IntersectionObserver pada satu penanda di bawah hero, bukan listener
  // scroll: tidak ada pekerjaan per-frame, dan peramban yang membatalkannya
  // cukup menyisakan navigasi biasa.
  useEffect(() => {
    const penanda = document.getElementById("cu-penanda");
    if (!penanda) return;
    const pengamat = new IntersectionObserver(
      ([entri]) => setRingkas(!entri.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px" },
    );
    pengamat.observe(penanda);
    return () => pengamat.disconnect();
  }, []);

  return (
    <header className="cu-nav" data-ringkas={ringkas ? "" : undefined}>
      <a href="/cari-usaha" className="cu-merek">
        {namaKegiatan}
      </a>

      <div className="cu-nav-cari" aria-hidden={ringkas ? undefined : true}>
        {ringkas && <KotakCari nilaiAwal={nilaiAwal} ringkas />}
      </div>

      <a href="/login" className="cu-masuk">
        <LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <span>Masuk</span>
      </a>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Tumpukan kartu usaha di hero, bergilir sendiri                       */
/* ------------------------------------------------------------------ */

/** Bentuk kartu hero. Ditulis ulang di sini, bukan diimpor dari `data.ts`:
 *  modul itu ber-`server-only` dan berkas ini ikut ke bundel peramban. */
export interface KartuUsaha {
  nama: string;
  jenis: string | null;
  kota: string | null;
  rona: string;
}

/** Sebanyak-banyaknya tiga kartu terlihat sekaligus; sisanya antre di belakang
 *  tumpukan. Direktori yang isinya baru satu atau dua usaha menampilkan
 *  sebanyak yang ada, bukan kartu kosong sebagai pengganjal. */
const TAMPIL_MAKS = 3;

/** Jeda antar giliran. Cukup lama untuk sempat dibaca sampai habis, cukup
 *  singkat supaya tumpukan tidak terlihat diam kalau hanya dipandang sekilas. */
const JEDA = 3600;

/** Rotasi butuh dua slot penyangga di luar layar: satu untuk kartu yang baru
 *  saja terbang keluar, satu lagi untuk kartu yang menunggu giliran masuk.
 *  Tanpa penyangga, kartu yang keluar langsung dipanggil masuk lagi dan
 *  terlihat terbang mundur.
 *
 *  Penyangga itu tidak harus berisi usaha yang berbeda. Direktori yang baru
 *  berisi tiga usaha tetap bisa menggilir kartunya — daftarnya diulang sampai
 *  slotnya cukup, dan karena jendela yang terlihat tidak pernah lebih lebar
 *  dari daftar aslinya, tidak akan pernah ada dua kartu kembar di layar pada
 *  saat yang sama. Yang terlihat tetap tumpukan yang berputar tenang, bukan
 *  tumpukan yang mati gara-gara direktorinya masih pendek. */
function susunGiliran(daftar: KartuUsaha[], tampil: number): KartuUsaha[] {
  const minimal = tampil + 2;
  if (daftar.length < 2 || daftar.length >= minimal) return daftar;
  const ulang = Math.ceil(minimal / daftar.length);
  return Array.from({ length: ulang }, () => daftar).flat();
}

/** Tumpukan kartu usaha di kolom kanan hero.
 *
 *  Dua gerak sekaligus, dan keduanya sengaja dipisah lapisannya:
 *
 *  - Panggungnya memiringkan diri mengikuti kursor. Kartunya duduk di kedalaman
 *    Z yang berbeda, jadi memiringkan panggung saja sudah menghasilkan paralaks
 *    sungguhan — kartu depan bergerak lebih jauh daripada kartu belakang.
 *  - Isinya bergilir sendiri. Kartu terdepan terbang keluar, dua di belakangnya
 *    maju, dan satu usaha baru muncul dari tumpukan paling belakang. Hero jadi
 *    memamerkan sembilan usaha, bukan tiga — dan tetap bergilir walau
 *    direktorinya baru berisi dua atau tiga.
 *
 *  Yang dipindahkan React hanya nomor slot tiap kartu; perpindahannya sendiri
 *  urusan transisi CSS. Tidak ada satu pun nilai per-frame yang masuk state.
 */
export function TumpukanUsaha({ daftar }: { daftar: KartuUsaha[] }) {
  const tampilMaks = Math.min(TAMPIL_MAKS, daftar.length);
  const kartu = susunGiliran(daftar, tampilMaks);
  const n = kartu.length;
  // Satu usaha saja tidak punya apa pun untuk digilir; kartunya diam.
  const berputar = n >= tampilMaks + 2;
  const [awal, setAwal] = useState(0);
  const [tertahan, setTertahan] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Panggung miring mengikuti kursor. Sudutnya sengaja kecil; lebih dari ini
  // berhenti terasa mahal dan mulai terasa seperti mainan.
  useEffect(() => {
    const el = ref.current;
    if (!el || gerakDikurangi() || !window.matchMedia("(hover: hover)").matches) return;

    // Kursor didengarkan di seluruh hero, bukan hanya di atas kartunya, supaya
    // tumpukan sudah bereaksi sebelum kursor sampai ke sana.
    const hero = el.closest<HTMLElement>(".cu-atas");
    if (!hero) return;

    let raf = 0;
    let px = 0;
    let py = 0;

    // Sudutnya ditulis lengkap dengan satuannya. Perkaliannya bisa saja
    // diserahkan ke calc() di CSS, tapi menaruh angka jadi di sini membuat
    // batas sudutnya terbaca di satu tempat yang sama dengan penjepitnya.
    const tulis = () => {
      raf = 0;
      el.style.setProperty("--putar-y", `${(px * 7).toFixed(2)}deg`);
      el.style.setProperty("--putar-x", `${(py * -5).toFixed(2)}deg`);
    };
    const jadwalkan = () => {
      if (!raf) raf = requestAnimationFrame(tulis);
    };

    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
      jadwalkan();
    };
    const onLeave = () => {
      px = 0;
      py = 0;
      jadwalkan();
    };

    hero.addEventListener("pointermove", onMove, { passive: true });
    hero.addEventListener("pointerleave", onLeave);
    return () => {
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Giliran kartu. Berhenti saat kursor atau fokus keyboard sedang berada di
  // tumpukan — kartunya tautan, dan tautan yang bergeser tepat saat diklik
  // adalah cara tercepat membuat orang membenci sebuah animasi.
  useEffect(() => {
    if (!berputar || tertahan || gerakDikurangi()) return;
    const jam = window.setInterval(() => {
      // Tab yang tersembunyi tidak menganimasikan apa pun, jadi memajukan
      // giliran di sana hanya membuang isi tumpukan tanpa ada yang melihat.
      if (document.hidden) return;
      setAwal((a) => (a + 1) % n);
    }, JEDA);
    return () => window.clearInterval(jam);
  }, [berputar, tertahan, n]);

  return (
    <div className="cu-tumpuk" style={{ "--n": tampilMaks } as CSSProperties}>
      <div
        ref={ref}
        className="cu-panggung"
        onPointerEnter={() => setTertahan(true)}
        onPointerLeave={() => setTertahan(false)}
        onFocusCapture={() => setTertahan(true)}
        onBlurCapture={() => setTertahan(false)}
      >
        {kartu.map((u, i) => {
          const slot = (i - awal + n) % n;
          const tampil = slot < tampilMaks;
          // Kartu yang baru saja meninggalkan posisi terdepan. Satu giliran
          // penuh dipakai untuk terbang keluar, baru kemudian ia dipindahkan
          // diam-diam ke belakang tumpukan.
          const keluar = berputar && slot === n - 1;

          return (
            <a
              key={`${u.nama}-${i}`}
              href={`/cari-usaha?q=${encodeURIComponent(u.nama)}`}
              className="cu-tumpuk-kartu"
              data-rona={u.rona}
              data-posisi={tampil ? "tampil" : keluar ? "keluar" : "siap"}
              // Kartu yang tak terlihat tetap ada di DOM supaya perpindahannya
              // bisa ditransisikan, tapi tidak boleh ikut urutan Tab dan tidak
              // boleh dibacakan.
              tabIndex={tampil ? undefined : -1}
              aria-hidden={tampil ? undefined : true}
              style={
                {
                  // Slot menentukan posisi; `--i` tetap melekat pada kartunya
                  // dan hanya dipakai untuk menyelang-nyeling animasi mendarat
                  // dan ayunan, supaya keduanya tidak pernah dimulai ulang di
                  // tengah jalan saat slotnya berganti.
                  "--slot": tampil ? slot : keluar ? 0 : tampilMaks - 1,
                  "--i": i,
                } as CSSProperties
              }
            >
              <span className="cu-tumpuk-isi">
                <span className="cu-titik" aria-hidden="true" />
                <span className="cu-tumpuk-nama">{u.nama}</span>
                <span className="cu-tumpuk-meta">
                  {[u.jenis, u.kota].filter(Boolean).join(", ")}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Angka yang berjalan naik                                             */
/* ------------------------------------------------------------------ */

export function AngkaHidup({ nilai }: { nilai: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Angka kecil ditulis apa adanya. Menghitung naik dari 0 ke 1 tidak
    // menambah apa pun, dan pada judul hasil sempat terbaca "0 usaha untuk
    // ..." — persis kebalikan dari yang sebenarnya terjadi.
    if (gerakDikurangi() || nilai < 10) {
      el.textContent = String(nilai);
      return;
    }

    const durasi = 900;
    let mulai = 0;
    let raf = 0;
    const tick = (t: number) => {
      if (!mulai) mulai = t;
      const p = Math.min(1, (t - mulai) / durasi);
      el.textContent = String(Math.round(nilai * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [nilai]);

  // Nilai akhir sudah ada di HTML server, jadi tanpa JS angkanya tetap benar
  // dan tidak ada pergeseran tata letak saat animasi mulai.
  return <span ref={ref}>{nilai}</span>;
}

/* ------------------------------------------------------------------ */
/* Sorotan mengikuti kursor                                             */
/* ------------------------------------------------------------------ */

export function Sorot({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const akar = ref.current;
    if (!akar || gerakDikurangi() || !window.matchMedia("(hover: hover)").matches) return;

    let raf = 0;
    let sasaran: HTMLElement | null = null;
    let x = 0;
    let y = 0;

    const tulis = () => {
      raf = 0;
      if (sasaran) {
        sasaran.style.setProperty("--mx", `${x}px`);
        sasaran.style.setProperty("--my", `${y}px`);
      }
    };

    // Satu listener untuk seluruh daftar, bukan satu per kartu.
    const onMove = (e: PointerEvent) => {
      const kartu = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-sorot]");
      if (!kartu) return;
      const r = kartu.getBoundingClientRect();
      sasaran = kartu;
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(tulis);
    };

    akar.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      akar.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
