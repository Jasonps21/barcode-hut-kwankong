import { pinyin } from "pinyin-pro";

/**
 * Ubah nama Hanzi menjadi Pinyin (cara baca) dengan tanda nada.
 * Contoh: "陳為慶" -> "Chén Wèi Qìng"
 *
 * Setiap karakter Han di-romanisasi dan ditampilkan dengan huruf kapital di
 * depan, mengikuti gaya penulisan nama pada buku peserta. Karakter non-Han
 * (spasi, tanda baca, huruf latin) dibiarkan apa adanya.
 */
export function hanziToPinyin(hanzi: string | null | undefined): string {
  const src = (hanzi ?? "").trim();
  if (!src) return "";
  if (!hasHanzi(src)) return src;

  const result = pinyin(src, {
    toneType: "symbol", // tetap pakai tanda nada (ǎ á à ā)
    type: "array",
    nonZh: "consecutive", // gabungkan karakter non-han berurutan jadi satu token
  });

  return result
    .map((syllable) => capitalizeFirst(syllable.trim()))
    .filter(Boolean)
    .join(" ");
}

/** True jika string mengandung minimal satu karakter Han (CJK). */
export function hasHanzi(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[㐀-䶿一-鿿豈-﫿]/.test(text);
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
