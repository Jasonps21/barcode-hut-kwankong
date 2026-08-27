import type { CSSProperties } from "react";
import { ArrowRight, MapPin, MessageCircle, SearchX } from "lucide-react";
import { normalizeWaNumber } from "@/lib/wa-template";
import { cariUsaha, type Kategori } from "./data";
import { TeksNaik } from "./teks";
import { AngkaHidup, Sorot } from "./interaksi";

/** Batas kartu yang masih ikut kaskade masuk saat halaman dimuat. Sisanya
 *  ditandai data-gulir dan baru terungkap saat digulir mendekat, supaya daftar
 *  panjang tidak menghabiskan seluruh koreografinya sebelum sempat terlihat. */
const BATAS_LIPATAN = 8;

function gerak(i: number) {
  return {
    style: { "--i": Math.min(i, 12) } as CSSProperties,
    "data-gulir": i >= BATAS_LIPATAN ? "" : undefined,
    "data-sorot": "",
  };
}

export function KerangkaHasil() {
  return (
    <div className="cu-kerangka" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="cu-kerangka-kartu"
          style={{ "--i": i } as CSSProperties}
        >
          <span className="cu-kerangka-titik" />
          <span className="cu-kerangka-baris cu-w-70" />
          <span className="cu-kerangka-baris cu-w-40" />
        </div>
      ))}
    </div>
  );
}

export async function Hasil({
  q,
  kategori,
  totalUsaha,
  totalKota,
}: {
  q: string;
  kategori: Kategori[];
  totalUsaha: number;
  totalKota: number;
}) {
  if (!q) {
    return <JelajahKategori kategori={kategori} totalUsaha={totalUsaha} totalKota={totalKota} />;
  }

  const rows = await cariUsaha(q);
  // Hasil memakai rona yang sama dengan petak kategorinya.
  const rona = new Map(kategori.map((k) => [k.nama, k.rona]));

  if (rows.length === 0) {
    const saran = kategori.filter((k) => k.jumlah > 0).slice(0, 8);
    return (
      <section className="cu-hampa">
        <SearchX className="cu-hampa-ikon" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="cu-hampa-judul">Tidak ada yang cocok dengan &ldquo;{q}&rdquo;</h2>
        <p className="cu-hampa-teks">Coba kata yang lebih umum, misalnya jenis usahanya saja.</p>
        {saran.length > 0 && (
          <div className="cu-saran">
            {saran.map((k, i) => (
              <a
                key={k.nama}
                href={`/cari-usaha?q=${encodeURIComponent(k.nama)}`}
                className="cu-saran-item"
                data-rona={k.rona}
                style={{ "--i": i } as CSSProperties}
              >
                <span className="cu-titik" aria-hidden="true" />
                {k.nama}
              </a>
            ))}
          </div>
        )}
        <a href="/cari-usaha" className="cu-tautan">
          Kembali ke semua kategori
        </a>
      </section>
    );
  }

  return (
    <section>
      <div className="cu-hasil-kepala">
        <h2 className="cu-hasil-judul" aria-live="polite">
          <strong>
            <AngkaHidup nilai={rows.length} />
          </strong>{" "}
          usaha untuk &ldquo;{q}&rdquo;
        </h2>
        <a href="/cari-usaha" className="cu-tautan">
          Bersihkan
        </a>
      </div>

      <Sorot className="cu-daftar">
        {rows.map((r, i) => {
          const nomorUsaha = r.peserta_nomor_usaha ?? [];
          const lokasi = [r.kota_kabupaten, r.provinsi].filter(Boolean).join(", ");
          const jenis = r.jenis_usaha?.nama;

          return (
            <article
              key={r.id}
              className="cu-kartu"
              data-rona={(jenis && rona.get(jenis)) || "daun"}
              {...gerak(i)}
            >
              <div className="cu-kartu-kepala">
                <h3 className="cu-kartu-nama">{r.nama}</h3>
                {jenis && (
                  <span className="cu-kartu-jenis">
                    <span className="cu-titik" aria-hidden="true" />
                    {jenis}
                  </span>
                )}
              </div>

              {r.keterangan && <p className="cu-kartu-ket">{r.keterangan}</p>}

              <p className="cu-kartu-lokasi">
                <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  {r.alamat}
                  {lokasi && <>, {lokasi}</>}
                </span>
              </p>

              <div className="cu-kartu-kontak">
                {nomorUsaha.length === 0 && (
                  <span className="cu-kontak-kosong">Nomor kontak belum dicatat</span>
                )}
                {nomorUsaha.map((n, ni) => {
                  const wa = normalizeWaNumber(n.nomor);
                  const isi = (
                    <>
                      <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      {n.label ? `${n.label}: ` : ""}
                      {n.nomor}
                    </>
                  );
                  return wa ? (
                    <a
                      key={ni}
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={ni === 0 ? "cu-wa cu-wa-utama" : "cu-wa"}
                    >
                      {isi}
                    </a>
                  ) : (
                    <span key={ni} className="cu-kontak-kosong">
                      {isi}
                    </span>
                  );
                })}
              </div>
            </article>
          );
        })}
      </Sorot>
    </section>
  );
}

function JelajahKategori({
  kategori,
  totalUsaha,
  totalKota,
}: {
  kategori: Kategori[];
  totalUsaha: number;
  totalKota: number;
}) {
  if (kategori.length === 0) {
    return (
      <section className="cu-hampa">
        <SearchX className="cu-hampa-ikon" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="cu-hampa-judul">Belum ada jenis usaha</h2>
        <p className="cu-hampa-teks">
          Pengurus dapat menambahkannya lewat menu Jenis Usaha setelah masuk.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="cu-bagian">
        <TeksNaik teks="Pilih jenis usaha" className="cu-bagian-judul" saatGulir />
        <p className="cu-bagian-cacah">
          {totalUsaha > 0 ? (
            <>
              <AngkaHidup nilai={totalUsaha} /> usaha di <AngkaHidup nilai={totalKota} /> kota
            </>
          ) : (
            "Belum ada usaha yang terdaftar"
          )}
        </p>
      </div>

      {/* Petak melebar sendiri lewat flex-grow, jadi baris terakhir tidak pernah
          menyisakan lubang berapa pun jumlah kategorinya. */}
      <Sorot className="cu-petak">
        {kategori.map((k, i) => (
          <a
            key={k.nama}
            href={`/cari-usaha?q=${encodeURIComponent(k.nama)}`}
            className="cu-kat"
            data-rona={k.rona}
            {...gerak(i)}
          >
            <span className="cu-titik" aria-hidden="true" />
            <span className="cu-kat-nama">{k.nama}</span>
            <span className="cu-kat-jumlah">
              {k.jumlah > 0 ? `${k.jumlah} usaha` : "Belum ada isi"}
            </span>
            <ArrowRight className="cu-kat-panah" strokeWidth={1.75} aria-hidden="true" />
          </a>
        ))}
      </Sorot>
    </section>
  );
}
