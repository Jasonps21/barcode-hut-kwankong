import type { CSSProperties, ElementType } from "react";

/** Teks yang naik huruf demi huruf dari balik topeng.
 *
 *  Kata tetap utuh sebagai satuan baris supaya pemenggalannya wajar; hurufnya
 *  yang bergiliran. Teks aslinya dipasang di aria-label dan pecahannya ditutup
 *  dari pembaca layar, karena huruf yang terpisah-pisah akan dibaca satu per
 *  satu seperti mengeja.
 *
 *  `saatGulir` mengganti pemicunya: bukan lagi kaskade waktu saat halaman
 *  dimuat, melainkan posisi gulir. Dipakai untuk judul yang berada di bawah
 *  lipatan, yang kalau memakai kaskade waktu sudah selesai bergerak jauh
 *  sebelum sempat terlihat.
 */
export function TeksNaik({
  teks,
  as: Tag = "h2",
  className,
  saatGulir = false,
}: {
  teks: string;
  as?: ElementType;
  className?: string;
  saatGulir?: boolean;
}) {
  let urutan = 0;
  return (
    <Tag className={className} aria-label={teks} data-gulir-teks={saatGulir ? "" : undefined}>
      {teks.split(" ").map((kata, k) => (
        <span key={k} className="cu-kata" aria-hidden="true">
          {[...kata].map((huruf, h) => (
            <span key={h} className="cu-huruf" style={{ "--i": urutan++ } as CSSProperties}>
              <span>{huruf}</span>
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}
