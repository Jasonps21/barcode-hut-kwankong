import "server-only";
import { createZip, type ZipEntry } from "@/lib/zip";

/**
 * Pembuat berkas .xlsx yang fotonya tertanam di dalam sel.
 *
 * Pustaka `xlsx` (SheetJS) yang dipakai di rekap lain sengaja tidak dipakai di
 * sini: penyisipan gambar hanya ada di edisi berbayarnya, sedangkan yang
 * terpasang di proyek ini edisi komunitas. Untungnya .xlsx sebenarnya cuma
 * arsip ZIP berisi XML, jadi bagian-bagiannya bisa disusun langsung memakai
 * penulis ZIP milik kita sendiri.
 */

const EMU_PER_PIXEL = 9525;
/** Kotak tempat foto diletakkan, dalam piksel. Tinggi baris & lebar kolom
 *  bukti diturunkan dari angka ini supaya foto tidak pernah melewati selnya. */
const KOTAK_FOTO = { lebar: 240, tinggi: 180 };
const MARGIN_FOTO = 4;

export interface KolomSpec {
  judul: string;
  /** Lebar kolom dalam satuan "karakter" milik Excel. */
  lebar: number;
  /** Angka dirapatkan ke kanan dan diberi format Rupiah. */
  angka?: boolean;
}

export interface BarisFoto {
  nilai: (string | number | null)[];
  /** JPEG mentah. Kosongkan bila baris ini tidak punya bukti. */
  foto?: Uint8Array;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel menolak berkas yang mengandung karakter kontrol mentah.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

/** Nama kolom Excel: 0 -> A, 25 -> Z, 26 -> AA. */
function namaKolom(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) {
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}

/**
 * Baca lebar & tinggi JPEG dari penanda SOF-nya.
 *
 * Dibutuhkan supaya foto diperkecil dengan rasio aslinya; tanpa ini gambar
 * potret akan tampak gepeng saat dipaksa mengisi kotak. Bila penanda tidak
 * ketemu, pemanggil memakai ukuran kotak apa adanya.
 */
export function ukuranJpeg(buf: Uint8Array): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const penanda = buf[i + 1];
    // SOF0..SOF15 memuat dimensi, kecuali DHT (C4), JPG (C8) dan DAC (CC).
    if (penanda >= 0xc0 && penanda <= 0xcf && penanda !== 0xc4 && penanda !== 0xc8 && penanda !== 0xcc) {
      const h = (buf[i + 5] << 8) | buf[i + 6];
      const w = (buf[i + 7] << 8) | buf[i + 8];
      return w > 0 && h > 0 ? { w, h } : null;
    }
    const panjang = (buf[i + 2] << 8) | buf[i + 3];
    if (panjang < 2) return null;
    i += 2 + panjang;
  }
  return null;
}

/** Perkecil agar muat di kotak tanpa mengubah rasio; gambar kecil tidak dibesarkan. */
function muatkan(w: number, h: number): { w: number; h: number } {
  const maksW = KOTAK_FOTO.lebar - MARGIN_FOTO * 2;
  const maksH = KOTAK_FOTO.tinggi - MARGIN_FOTO * 2;
  const skala = Math.min(maksW / w, maksH / h, 1);
  return { w: Math.round(w * skala), h: Math.round(h * skala) };
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const enc = new TextEncoder();
const bytes = (s: string): Uint8Array => enc.encode(s);

/**
 * Susun .xlsx berisi satu lembar tabel, dengan foto tertanam di kolom terakhir.
 * Mengembalikan stream ZIP yang sudah berformat xlsx.
 */
export function buatXlsxBerfoto(opts: {
  namaSheet: string;
  kolom: KolomSpec[];
  baris: BarisFoto[];
}): ReadableStream<Uint8Array> {
  const { namaSheet, kolom, baris } = opts;
  const kolomFoto = kolom.length; // foto ditaruh di kolom setelah kolom data
  const totalKolom = kolom.length + 1;

  // ---- kumpulkan foto & posisinya lebih dulu ----
  interface Tempel { indeksBaris: number; media: string; w: number; h: number }
  const tempel: Tempel[] = [];
  const media: ZipEntry[] = [];
  baris.forEach((b, i) => {
    if (!b.foto || b.foto.length === 0) return;
    const asli = ukuranJpeg(b.foto) ?? { w: KOTAK_FOTO.lebar, h: KOTAK_FOTO.tinggi };
    const { w, h } = muatkan(asli.w, asli.h);
    const nama = `image${tempel.length + 1}.jpeg`;
    media.push({ name: `xl/media/${nama}`, data: b.foto });
    tempel.push({ indeksBaris: i, media: nama, w, h });
  });

  // ---- sheet1.xml ----
  const cols = kolom
    .map((k, i) => `<col min="${i + 1}" max="${i + 1}" width="${k.lebar}" customWidth="1"/>`)
    .join("");
  const colFoto = `<col min="${kolomFoto + 1}" max="${kolomFoto + 1}" width="${
    Math.round(((KOTAK_FOTO.lebar - 5) / 7) * 100) / 100
  }" customWidth="1"/>`;

  const barisPunyaFoto = new Set(tempel.map((t) => t.indeksBaris));
  const tinggiFotoPt = Math.round(KOTAK_FOTO.tinggi * 0.75 * 100) / 100;

  const sel = (r: number, c: number, v: string | number | null, gayaAngka: boolean): string => {
    const ref = `${namaKolom(c)}${r}`;
    if (v === null || v === "") return "";
    if (typeof v === "number") return `<c r="${ref}" s="${gayaAngka ? 2 : 0}"><v>${v}</v></c>`;
    // t="inlineStr" menghindari kebutuhan sharedStrings.xml sama sekali.
    return `<c r="${ref}" t="inlineStr" s="${gayaAngka ? 2 : 3}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };

  const barisXml: string[] = [];
  barisXml.push(
    `<row r="1" ht="22" customHeight="1">${kolom
      .map((k, i) => `<c r="${namaKolom(i)}1" t="inlineStr" s="1"><is><t>${esc(k.judul)}</t></is></c>`)
      .join("")}<c r="${namaKolom(kolomFoto)}1" t="inlineStr" s="1"><is><t>Bukti Transfer</t></is></c></row>`,
  );

  baris.forEach((b, i) => {
    const r = i + 2;
    const tinggi = barisPunyaFoto.has(i) ? ` ht="${tinggiFotoPt}" customHeight="1"` : "";
    const isi = kolom.map((k, c) => sel(r, c, b.nilai[c] ?? null, Boolean(k.angka))).join("");
    barisXml.push(`<row r="${r}"${tinggi}>${isi}</row>`);
  });

  const sheet =
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>` +
    `<dimension ref="A1:${namaKolom(totalKolom - 1)}${baris.length + 1}"/>` +
    // Baris judul dibekukan supaya tetap terlihat saat menggulir ribuan baris.
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}${colFoto}</cols>` +
    `<sheetData>${barisXml.join("")}</sheetData>` +
    `<autoFilter ref="A1:${namaKolom(kolom.length - 1)}${baris.length + 1}"/>` +
    (tempel.length ? '<drawing r:id="rId1"/>' : "") +
    "</worksheet>";

  // ---- drawing1.xml ----
  const anchor = (t: Tempel, idx: number): string => {
    const offX = MARGIN_FOTO * EMU_PER_PIXEL;
    const offY = MARGIN_FOTO * EMU_PER_PIXEL;
    const cx = t.w * EMU_PER_PIXEL;
    const cy = t.h * EMU_PER_PIXEL;
    return (
      "<xdr:oneCellAnchor>" +
      `<xdr:from><xdr:col>${kolomFoto}</xdr:col><xdr:colOff>${offX}</xdr:colOff>` +
      `<xdr:row>${t.indeksBaris + 1}</xdr:row><xdr:rowOff>${offY}</xdr:rowOff></xdr:from>` +
      `<xdr:ext cx="${cx}" cy="${cy}"/>` +
      "<xdr:pic>" +
      `<xdr:nvPicPr><xdr:cNvPr id="${idx + 2}" name="Bukti ${idx + 1}"/>` +
      '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
      `<xdr:blipFill><a:blip r:embed="rId${idx + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
      "</xdr:pic><xdr:clientData/></xdr:oneCellAnchor>"
    );
  };

  const drawing =
    XML_HEAD +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    tempel.map(anchor).join("") +
    "</xdr:wsDr>";

  const drawingRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    tempel
      .map(
        (t, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${t.media}"/>`,
      )
      .join("") +
    "</Relationships>";

  // ---- styles.xml ----
  const styles =
    XML_HEAD +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot;\\ #,##0"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1C1B18"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" horizontal="right"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  // ---- rangka paket ----
  const contentTypes =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    (tempel.length
      ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
      : "") +
    "</Types>";

  const rootRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const workbook =
    XML_HEAD +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${esc(namaSheet).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>` +
    "</workbook>";

  const workbookRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";

  const sheetRels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' +
    "</Relationships>";

  // [Content_Types].xml wajib jadi bagian pertama arsip.
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: bytes(contentTypes) },
    { name: "_rels/.rels", data: bytes(rootRels) },
    { name: "xl/workbook.xml", data: bytes(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: bytes(workbookRels) },
    { name: "xl/styles.xml", data: bytes(styles) },
    { name: "xl/worksheets/sheet1.xml", data: bytes(sheet) },
  ];
  if (tempel.length) {
    entries.push(
      { name: "xl/worksheets/_rels/sheet1.xml.rels", data: bytes(sheetRels) },
      { name: "xl/drawings/drawing1.xml", data: bytes(drawing) },
      { name: "xl/drawings/_rels/drawing1.xml.rels", data: bytes(drawingRels) },
      ...media,
    );
  }

  return createZip(entries);
}
