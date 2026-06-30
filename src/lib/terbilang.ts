const ANGKA = [
  "", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan",
  "sembilan", "sepuluh", "sebelas",
];

function toWords(n: number): string {
  if (n < 12) return ANGKA[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) {
    const sisa = n % 10;
    return `${toWords(Math.floor(n / 10))} puluh${sisa ? ` ${toWords(sisa)}` : ""}`;
  }
  if (n < 200) return `seratus${n % 100 ? ` ${toWords(n % 100)}` : ""}`;
  if (n < 1000) {
    const sisa = n % 100;
    return `${toWords(Math.floor(n / 100))} ratus${sisa ? ` ${toWords(sisa)}` : ""}`;
  }
  if (n < 2000) return `seribu${n % 1000 ? ` ${toWords(n % 1000)}` : ""}`;
  if (n < 1_000_000) {
    const sisa = n % 1000;
    return `${toWords(Math.floor(n / 1000))} ribu${sisa ? ` ${toWords(sisa)}` : ""}`;
  }
  if (n < 1_000_000_000) {
    const sisa = n % 1_000_000;
    return `${toWords(Math.floor(n / 1_000_000))} juta${sisa ? ` ${toWords(sisa)}` : ""}`;
  }
  if (n < 1_000_000_000_000) {
    const sisa = n % 1_000_000_000;
    return `${toWords(Math.floor(n / 1_000_000_000))} miliar${sisa ? ` ${toWords(sisa)}` : ""}`;
  }
  const sisa = n % 1_000_000_000_000;
  return `${toWords(Math.floor(n / 1_000_000_000_000))} triliun${sisa ? ` ${toWords(sisa)}` : ""}`;
}

/** Ubah angka menjadi kata bahasa Indonesia. 100000 -> "seratus ribu". */
export function terbilang(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return toWords(Math.floor(n)).replace(/\s+/g, " ").trim();
}
