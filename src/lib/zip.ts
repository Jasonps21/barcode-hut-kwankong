import "server-only";

/**
 * Penulis ZIP minimal, tanpa dependensi.
 *
 * Dibuat sendiri karena proyek ini belum punya pustaka ZIP dan isinya toh sudah
 * berupa berkas terkompresi (JPG/PNG/PDF) — dipadatkan lagi hampir tidak
 * mengecilkan apa pun, jadi metode "store" sudah cukup dan jauh lebih sederhana
 * untuk dipastikan benar.
 *
 * Keluarannya berupa ReadableStream, bukan satu Buffer besar: respons fungsi
 * serverless yang di-buffer penuh dibatasi beberapa MB saja, sedangkan arsip
 * bukti transfer bisa puluhan MB. Streaming melewati batas itu sekaligus
 * menjaga pemakaian memori tetap rendah.
 *
 * Catatan batas: format yang ditulis di sini ZIP biasa (bukan ZIP64), jadi
 * aman selama total arsip < 4GB dan jumlah berkas < 65.535 — jauh di atas
 * kebutuhan rekap donasi.
 */

export interface ZipEntry {
  /** Nama di dalam arsip, boleh mengandung "/" untuk membuat folder. */
  name: string;
  data: Uint8Array;
}

/** Tabel CRC-32 (polinomial IEEE 802.3), disiapkan sekali saat modul dimuat. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Waktu berkas dalam format DOS yang dipakai header ZIP. */
function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Bit 11 pada flag memberi tahu pembaca ZIP bahwa nama berkas ber-encoding
 *  UTF-8 — tanpa ini nama dengan aksen/karakter non-ASCII bisa tampil rusak. */
const FLAG_UTF8 = 0x0800;

export function createZip(entries: ZipEntry[], now = new Date()): ReadableStream<Uint8Array> {
  const { time, date } = dosDateTime(now);

  // Nama ganda akan membingungkan saat diekstrak (sebagian pengekstrak diam-diam
  // menimpa berkas sebelumnya), jadi dibuat unik lebih dulu dengan sisipan angka.
  const dipakai = new Set<string>();
  const unik = entries.map((e) => {
    let nama = e.name;
    if (dipakai.has(nama)) {
      const titik = nama.lastIndexOf(".");
      const pangkal = titik > 0 ? nama.slice(0, titik) : nama;
      const ekstensi = titik > 0 ? nama.slice(titik) : "";
      let n = 2;
      while (dipakai.has(`${pangkal} (${n})${ekstensi}`)) n++;
      nama = `${pangkal} (${n})${ekstensi}`;
    }
    dipakai.add(nama);
    return { name: nama, data: e.data };
  });

  interface Catatan { nameBytes: Uint8Array; crc: number; size: number; offset: number }
  const catatan: Catatan[] = [];
  let offset = 0;
  let i = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < unik.length) {
        const { name, data } = unik[i++];
        const nameBytes = new TextEncoder().encode(name);
        const crc = crc32(data);

        const header = new DataView(new ArrayBuffer(30));
        header.setUint32(0, 0x04034b50, true); // tanda header lokal
        header.setUint16(4, 20, true); // versi minimum
        header.setUint16(6, FLAG_UTF8, true);
        header.setUint16(8, 0, true); // metode 0 = store
        header.setUint16(10, time, true);
        header.setUint16(12, date, true);
        header.setUint32(14, crc, true);
        header.setUint32(18, data.length, true); // ukuran terkompresi
        header.setUint32(22, data.length, true); // ukuran asli
        header.setUint16(26, nameBytes.length, true);
        header.setUint16(28, 0, true); // panjang extra field

        controller.enqueue(new Uint8Array(header.buffer));
        controller.enqueue(nameBytes);
        controller.enqueue(data);

        catatan.push({ nameBytes, crc, size: data.length, offset });
        offset += 30 + nameBytes.length + data.length;
        return;
      }

      // Seluruh berkas sudah terkirim — tutup dengan direktori pusat.
      const mulaiDirektori = offset;
      for (const c of catatan) {
        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true); // tanda direktori pusat
        cd.setUint16(4, 20, true); // versi pembuat
        cd.setUint16(6, 20, true); // versi minimum
        cd.setUint16(8, FLAG_UTF8, true);
        cd.setUint16(10, 0, true); // metode 0 = store
        cd.setUint16(12, time, true);
        cd.setUint16(14, date, true);
        cd.setUint32(16, c.crc, true);
        cd.setUint32(20, c.size, true);
        cd.setUint32(24, c.size, true);
        cd.setUint16(28, c.nameBytes.length, true);
        cd.setUint16(30, 0, true); // extra
        cd.setUint16(32, 0, true); // komentar
        cd.setUint16(34, 0, true); // nomor disk
        cd.setUint16(36, 0, true); // atribut internal
        cd.setUint32(38, 0, true); // atribut eksternal
        cd.setUint32(42, c.offset, true);

        controller.enqueue(new Uint8Array(cd.buffer));
        controller.enqueue(c.nameBytes);
        offset += 46 + c.nameBytes.length;
      }

      const akhir = new DataView(new ArrayBuffer(22));
      akhir.setUint32(0, 0x06054b50, true); // tanda akhir direktori
      akhir.setUint16(4, 0, true); // nomor disk
      akhir.setUint16(6, 0, true); // disk berisi awal direktori
      akhir.setUint16(8, catatan.length, true);
      akhir.setUint16(10, catatan.length, true);
      akhir.setUint32(12, offset - mulaiDirektori, true);
      akhir.setUint32(16, mulaiDirektori, true);
      akhir.setUint16(20, 0, true); // panjang komentar arsip
      controller.enqueue(new Uint8Array(akhir.buffer));

      controller.close();
    },
  });
}

/** Bersihkan teks agar aman jadi nama berkas di Windows/macOS/Linux. */
export function namaBerkasAman(s: string, maks = 60): string {
  return (
    s
      .replace(/[\\/:*?"<>|]/g, "-") // karakter terlarang di Windows
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "") // nama berawalan titik jadi tersembunyi di Unix
      .trim()
      .slice(0, maks)
      .trim() || "tanpa-nama"
  );
}
