import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ambilRingkasan } from "./data";
import { Hasil, KerangkaHasil } from "./hasil";
import { Kepala, KotakCari, TumpukanUsaha } from "./interaksi";
import { TeksNaik } from "./teks";
import "./cari-usaha.css";

/* Satu keluarga huruf untuk seluruh halaman. Plus Jakarta Sans rancangan
   Tokotype, dibuat untuk bahasa Indonesia, dan punya bobot 800 yang cukup
   tegas untuk judul, jadi tidak perlu huruf tampilan kedua. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const NAMA_KEGIATAN = process.env.NEXT_PUBLIC_EVENT_NAME ?? "Sistem Bingkisan";

const JUDUL = "Cari usaha & jasa milik warga";

export const metadata = {
  title: "Cari Usaha",
  description: "Cari usaha dan jasa milik warga, lalu hubungi pemiliknya langsung lewat WhatsApp.",
  openGraph: {
    title: `Cari Usaha - ${NAMA_KEGIATAN}`,
    description: "Cari usaha dan jasa milik warga, lalu hubungi pemiliknya langsung lewat WhatsApp.",
    type: "website",
  },
};

export default async function CariUsahaPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim();
  const { kategori, totalUsaha, totalKota, sorotan } = await ambilRingkasan();

  // Contoh untuk placeholder yang mengetik sendiri: pakai kategori yang benar
  // benar berisi dulu, supaya yang dicontohkan tidak berujung nol hasil.
  const contoh = (kategori.filter((k) => k.jumlah > 0).length ? kategori.filter((k) => k.jumlah > 0) : kategori)
    .slice(0, 5)
    .map((k) => k.nama);

  return (
    <div className={`cu-page ${jakarta.variable}`}>
      <a href="#isi" className="cu-lompat">
        Langsung ke isi
      </a>

      <Kepala namaKegiatan={NAMA_KEGIATAN} nilaiAwal={q} />

      <section className="cu-atas">
        {/* Kisi halus di belakang hero. Dekorasi murni, jadi ditutup dari
            pembaca layar dan tidak bisa ditunjuk kursor. */}
        <div className="cu-kisi" aria-hidden="true" />

        <div className="cu-atas-isi">
          <div className="cu-atas-kiri">
            <TeksNaik teks={JUDUL} as="h1" className="cu-judul" />
            <p className="cu-subjudul">Hubungi pemiliknya langsung lewat WhatsApp.</p>
            <KotakCari nilaiAwal={q} contoh={contoh} />
            <p className="cu-percaya">
              Dicatat dan diperbarui oleh pengurus {NAMA_KEGIATAN}.
            </p>
          </div>

          {sorotan.length > 0 && <TumpukanUsaha daftar={sorotan} />}
        </div>
      </section>

      {/* Penanda tak terlihat: begitu ini keluar dari layar, navigasi
          menumbuhkan kotak cari ringkas. */}
      <div id="cu-penanda" className="cu-penanda" aria-hidden="true" />

      <main className="cu-badan" id="isi">
        <Suspense key={q} fallback={<KerangkaHasil />}>
          <Hasil q={q} kategori={kategori} totalUsaha={totalUsaha} totalKota={totalKota} />
        </Suspense>
      </main>

      <footer className="cu-kaki">
        <span>{NAMA_KEGIATAN}</span>
        <a href="/login" className="cu-tautan">
          Masuk sebagai pengurus
        </a>
      </footer>
    </div>
  );
}
