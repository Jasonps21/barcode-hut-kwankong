# Ganti Pengiriman WhatsApp: Fonnte → API crm-wa

**Tanggal:** 2026-08-24
**Status:** Disetujui, siap masuk implementasi
**Disusun di:** sesi project `crm-wa`; implementasinya dikerjakan di sesi project ini

## Konteks

Tanda terima donasi dikirim lewat Fonnte, layanan WhatsApp tidak resmi, dan nomornya sudah
diblokir. Penggantinya adalah API resmi milik project `crm-wa` (`https://crm.byjason.dev`), yang
berjalan di atas WhatsApp Business API resmi Meta.

Perbedaan mendasar yang menentukan seluruh rancangan ini: Fonnte menerima **teks bebas**, sedangkan
Meta hanya menerima **template yang sudah disetujui** untuk pesan yang dimulai oleh bisnis. Isi
pesan tidak lagi disusun di project ini; yang dikirim hanyalah nilai variabelnya.

## Template yang dipakai

Sudah disetujui Meta pada 2026-08-24.

- **Nama:** `tanda_terima_hut_kwan_kong_2026`
- **Bahasa:** `id`
- **Kategori:** MARKETING
- **Biaya:** Rp 586,33 per pesan sebelum PPN, Rp 651 termasuk PPN 11%

Isinya memuat ucapan terima kasih HUT, blok TANDA TERIMA, tautan survei Google Forms, dan salam
penutup. Lima variabel:

| Variabel | Isi dari sistem ini |
|---|---|
| `{{1}}` | `formatNomorTT(nomor_tt, registered_at)` — mis. `0123/TT/2026` |
| `{{2}}` | nominal **tanpa awalan "Rp"**, mis. `500.000 (Lima ratus ribu rupiah)` — template sudah menuliskan "Rp" |
| `{{3}}` | `nama` |
| `{{4}}` | `alamat` |
| `{{5}}` | `formatTanggalIndo(registered_at)` — mis. `30 Juni 2026` |

**Jumlah kupon tidak ikut dikirim.** Template tidak punya variabel untuk itu, dan pemilik memutuskan
informasinya tidak lagi diperlukan karena acaranya sudah lewat.

**Batasan Meta yang wajib dipatuhi:** nilai variabel tidak boleh mengandung baris baru, tab, atau
lebih dari empat spasi berturut-turut. Meta menolak pesannya, bukan sekadar merapikannya. Karena itu
blok tanda terima tidak boleh dikirim sebagai satu variabel — baris barunya ada di template.

## Batas pengiriman Meta

Diperiksa langsung ke Meta pada 2026-08-24 untuk nomor `+62 819-7738-1333`:

```
messaging_limit_tier         : TIER_250      → 250 percakapan per 24 jam
quality_rating               : GREEN
status                       : CONNECTED
business_verification_status : not_verified  → inilah penyebab batas 250
account_review_status        : APPROVED
```

Batas 250 terkunci sampai badan usaha diverifikasi Meta; kualitas nomor sudah GREEN dan bukan
penyebabnya. Batas yang mengikat adalah **250 per 24 jam dari Meta**, bukan batas laju API crm-wa
(30 permintaan per menit).

## Keputusan yang sudah diambil

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Berkas | `src/lib/fonnte.ts` → `src/lib/whatsapp.ts` | Namanya berbohong setelah Fonnte tidak dipakai |
| Tanda tangan fungsi | `sendPesertaWa()` dan `processPendingWa()` tidak berubah | Empat pemanggilnya cukup mengganti baris import |
| `buildWaMessage` dan tautan wa.me | Tidak disentuh | Dipakai `peserta/page.tsx` dan `transaksi/page.tsx` untuk pesan manual yang dikirim manusia dari WhatsApp sendiri — bukan lewat API |
| Batas harian | Berhenti di 200 per 24 jam bergulir | Menyisakan 50 jatah untuk blast dari panel crm-wa |
| Cara menghitung batas | Jendela 24 jam bergulir, bukan tanggal kalender | Meta memakai jendela bergulir. Hitungan per tanggal akan lolos kalau 200 dikirim jam 23.00 lalu 200 lagi jam 00.30, dan yang kedua ditolak |
| Anti-kirim-ganda | Klaim baris sebelum mengirim | Duplikat kini berbiaya Rp 651 dan membuat donatur menerima dua tanda terima bernomor sama |
| Kolom `wa_log.fonnte_response` | Namanya dibiarkan | Menggantinya butuh migrasi Supabase dan merusak halaman WA Log sampai keduanya naik bersamaan |
| Cron | Tiap 10 menit | Batch 25 × jeda 2 detik = 50 detik, aman di bawah `maxDuration` 60 |

## Arsitektur

### Klien API

```ts
POST {CRM_WA_BASE_URL}/api/v1/messages/send
Authorization: Bearer {CRM_WA_TOKEN}
Accept: application/json

{
  "phone_number": "081234567890",
  "type": "template",
  "template_name": "tanda_terima_hut_kwan_kong_2026",
  "language_code": "id",
  "parameters": ["0123/TT/2026", "500.000 (Lima ratus ribu rupiah)", "NAMA", "ALAMAT", "30 Juni 2026"]
}
```

Nomor boleh format lokal `08…`; crm-wa menormalkannya sendiri. Token dibuat di panel Filament crm-wa
(Users → Generate API token) dan berability `messages:send`.

### Penanganan balasan

| Kode | Arti | Tindakan |
|---|---|---|
| `201` | Terkirim | Tandai `sent`. Jangan pernah kirim ulang |
| `422` | Permintaan salah | Tandai `failed`. **Tidak** dicoba ulang — mengulang tidak menolong |
| `429` | Batas laju | Hentikan batch. Sisanya tetap `pending` untuk putaran berikutnya |
| `502` atau gagal jaringan | Gagal pasti | Boleh dicoba ulang, maksimal 2 percobaan |

crm-wa sengaja membalas kegagalan koneksi sebagai `502` dengan status `failed`, bukan sebagai hasil
ambigu, supaya pemanggil tidak mencoba ulang sesuatu yang sebenarnya terkirim.

### Penjaga anti-kirim-ganda

`sendPesertaWa()` dipanggil dua kali dari jalur berbeda: `after()` saat pendaftaran, dan cron sebagai
penadah. Kalau pengiriman berhasil tapi pembaruan `wa_status` gagal — atau Vercel membunuh fungsinya
di antara keduanya — barisnya tetap `pending` dan cron mengirimkannya untuk kedua kali.

Sebelum memanggil API, baris diklaim dengan pembaruan bersyarat: `wa_attempt_count` dinaikkan dari 0
ke 1 **hanya jika masih 0**, dan hasil pembaruan diperiksa. Tidak ada baris terpengaruh berarti
proses lain sudah mengklaimnya, dan pengiriman dilewati.

Memakai kolom yang sudah ada, jadi tidak perlu migrasi Supabase. `resendWaAction` harus ikut
menyetel `wa_attempt_count` kembali ke 0 supaya kirim ulang manual tetap bisa dilakukan.

### Batas 24 jam bergulir

Sebelum memproses batch, hitung baris `wa_log` berstatus `sent` yang `sent_at`-nya dalam 24 jam
terakhir. Berhenti bila sudah mencapai `CRM_WA_BATAS_24JAM`. Sisa antrean tetap `pending` dan lanjut
sendiri pada putaran cron berikutnya — bukan ditandai gagal.

### Variabel lingkungan

```
CRM_WA_BASE_URL="https://crm.byjason.dev"
CRM_WA_TOKEN=""
CRM_WA_TEMPLATE="tanda_terima_hut_kwan_kong_2026"
CRM_WA_LANGUAGE="id"
CRM_WA_BATAS_24JAM=200
CRM_WA_BATCH=25
CRM_WA_DELAY_SECONDS=2
```

Seluruh `FONNTE_*` dihapus dari `.env.example`.

### Cron

`vercel.json` diubah dari `"0 0 * * *"` menjadi `"*/10 * * * *"`.

## Verifikasi

Project ini **tidak punya perangkat tes** — tidak ada `vitest`, `jest`, atau skrip `test` di
`package.json`. Karena itu pekerjaan ini tidak bisa dikerjakan dengan tes lebih dulu.

Gantinya, urutan verifikasi berikut wajib dijalankan sebelum antrean dilepas:

1. Kirim ke **satu nomor milik sendiri** lewat tombol kirim ulang di halaman Peserta.
2. Periksa tanda terimanya benar-benar masuk, dan nominalnya tidak berbunyi "Rp Rp".
3. Periksa `wa_log` mencatat `sent` beserta balasan API.
4. Tekan kirim ulang **dua kali beruntun** pada peserta yang sama, pastikan hanya satu pesan sampai —
   ini menguji penjaga anti-kirim-ganda.
5. Baru setelah itu biarkan cron memproses antrean.

Jangan menyatakan pekerjaan ini selesai sebelum langkah 1–4 benar-benar dilihat hasilnya.

## Yang sengaja tidak dikerjakan

Migrasi nama kolom `wa_log.fonnte_response`, dan pengiriman jumlah kupon. Keduanya sudah
dipertimbangkan dan ditolak dengan alasan yang tercatat di tabel keputusan.
