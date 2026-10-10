import { formatRupiah, formatTanggalWITA } from "@/lib/utils";

/**
 * Satu baris riwayat sumbangan seorang anggota, lintas kegiatan.
 * Dipakai di layar petugas saat menagih dan sebagai bahan pesan pengingat.
 */
export interface BarisRiwayat {
  kegiatan: string;
  tanggal: string;
  nominal: number | string;
  buku: string | null;
  jumlahKupon: number;
}

export function totalRiwayat(baris: BarisRiwayat[]): number {
  return baris.reduce((t, b) => t + Number(b.nominal ?? 0), 0);
}

/**
 * Susun kalimat pengingat yang dibacakan/dikirim petugas saat menagih:
 * "Bapak/Ibu sudah menyumbang pada Ulang Tahun Kwan Kong tanggal 1 Juli 2026
 * sebesar Rp 1.000.000" — supaya anggota langsung ingat tanpa harus mengingat
 * sendiri.
 *
 * Sengaja dipisah dari komponen UI agar bisa dipakai ulang untuk tombol salin,
 * pesan WhatsApp, maupun cetak.
 */
export function buatPesanPengingat(nama: string, baris: BarisRiwayat[]): string {
  if (baris.length === 0) {
    return `Yth. Bapak/Ibu ${nama},\n\nBelum ada catatan sumbangan atas nama Anda di sistem kami.`;
  }

  const urut = [...baris].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const rincian = urut
    .map((b) => `• ${b.kegiatan}, ${formatTanggalWITA(b.tanggal, { day: "numeric", month: "long", year: "numeric" })} — ${formatRupiah(b.nominal)}`)
    .join("\n");

  const total = totalRiwayat(urut);
  const penutup =
    urut.length > 1
      ? `\nTotal seluruhnya: ${formatRupiah(total)}`
      : "";

  return (
    `Yth. Bapak/Ibu ${nama},\n\n` +
    `Terima kasih atas dukungan Anda selama ini. Berikut catatan sumbangan Anda:\n\n` +
    `${rincian}${penutup}\n\n` +
    `Semoga menjadi berkah. Terima kasih.`
  );
}
