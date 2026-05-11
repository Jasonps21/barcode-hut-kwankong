# PRD: Sistem Barcode Penerima Bingkisan

**Versi:** 4.0 (FINAL — Siap Development)
**Tanggal:** 10 Mei 2026
**Target Event:** September 2026

---

## 1. Latar Belakang

Klien membutuhkan sistem untuk mengelola distribusi paket bingkisan menggunakan kupon QR Code yang sudah dicetak sebelumnya. Sistem akan digunakan dari Mei 2026 (mulai pengumpulan donasi) hingga September 2026 (event distribusi). Petugas dibagi menjadi 6 kelompok dengan range kupon berbeda untuk akuntabilitas dan distribusi yang teratur.

## 2. Spesifikasi Final

| Item | Spesifikasi |
|------|-------------|
| Format barcode | QR Code |
| Estimasi total kupon | ~2.500 (final fleksibel, sesuai kebutuhan) |
| Aturan kupon | 1 kupon = 1 paket bingkisan |
| Pendaftaran peserta | Hanya via petugas |
| Jumlah kelompok | 6 kelompok |
| Total petugas | ±10 orang |
| Notifikasi WhatsApp | Otomatis via Fonnte |
| Lokasi distribusi | 1 titik terpusat |
| Tanggal event | September 2026 |
| Format range kupon | `[PREFIX][NOMOR]` (contoh: `A0001 - A0300`) |
| Konfigurasi event | Disimpan di environment variables (.env) |

## 3. Aktor / Pengguna Sistem

- **Admin (1–2 orang)** — kelola data, lihat semua kelompok, generate master kupon, kelola akun petugas.
- **Petugas Pendaftaran per Kelompok (6–8 orang)** — input data peserta dan scan kupon. Hanya bisa scan kupon dari range kelompoknya.
- **Petugas Distribusi per Kelompok** — scan kupon untuk mark "sudah diambil". Hanya bisa scan kupon dari range kelompoknya.

> Satu orang bisa punya peran ganda di kelompok yang sama.

## 4. Alur Kerja

### 4.1 Setup Awal (Admin)

1. Admin login.
2. Buat 6 kelompok dengan input format range kupon (contoh: `A0001 - A0300`).
3. Sistem auto-generate master kupon berdasarkan range.
4. Buat akun petugas dan assign ke kelompok.

### 4.2 Pendaftaran Peserta + Notifikasi WhatsApp

1. Petugas Kelompok X login.
2. Buka form "Tambah Peserta Baru".
3. Isi: nama, alamat, nomor WhatsApp, nominal donasi.
4. Scan kupon (atau input manual). Sistem validasi:
   - Kupon ada di master Kelompok X.
   - Kupon belum diasosiasikan.
   - Jika di luar range kelompok: peringatan "Kupon ini bukan milik Kelompok X".
5. Tambah baris kupon sesuai kebutuhan.
6. Tekan "Simpan".
7. Sistem otomatis kirim WA ke peserta via Fonnte (background, non-blocking).
8. Status pengiriman WA tampil di halaman daftar peserta.

### 4.3 Penukaran Bingkisan (di Event September)

1. Penerima datang dengan kupon fisik.
2. Petugas Distribusi Kelompok X scan QR Code.
3. Sistem validasi:
   - Kupon harus dari range Kelompok X. Jika dari kelompok lain: arahkan ke konter yang sesuai.
   - Cek status kupon (belum/sudah ditukar).
4. Jika valid & belum ditukar: tampilkan info peserta + tombol "Konfirmasi Pengambilan".
5. Konfirmasi → status berubah jadi "redeemed" dengan timestamp & nama petugas.

## 5. Functional Requirements

### 5.1 Modul Manajemen Kelompok & Master Kupon

**Form Tambah Kelompok:**
- Nama Kelompok
- Format Range Kupon (text, contoh: `A0001 - A0300`)
- Tombol "Generate Kupon"

**Logic Parsing Format Range:**

| Input User | Prefix | Start | End | Padding | Total |
|------------|--------|-------|-----|---------|-------|
| `A0001 - A0300` | A | 1 | 300 | 4 | 300 |
| `B0001 - B0500` | B | 1 | 500 | 4 | 500 |
| `KP-001 - KP-300` | KP- | 1 | 300 | 3 | 300 |

**Validasi sebelum generate:**
- Prefix tidak boleh duplikat.
- Range tidak overlap dengan kelompok lain.
- Tampilkan preview total kupon sebelum konfirmasi.

### 5.2 Modul Manajemen Peserta

Form input: nama, alamat, no_whatsapp, nominal_donasi, tabel kupon.

Halaman daftar: filter per kelompok, status WhatsApp (sent/failed/pending), tombol kirim ulang WA, export Excel/CSV.

### 5.3 Modul Scan QR Code

- Library `html5-qrcode`.
- Mode scan beruntun untuk pendaftaran.
- Validasi prefix kupon harus sesuai kelompok petugas.
- Feedback visual + suara/getar.

### 5.4 Modul Notifikasi WhatsApp via Fonnte

**Trigger:** Otomatis setelah peserta tersimpan.

**Implementasi:**
- Backend Next.js call Fonnte API async.
- Status pengiriman disimpan di `peserta.wa_status`.
- Retry 3x dalam 5 menit jika gagal.

**Template Pesan:**

Template disimpan sebagai konstanta di kode (file `lib/wa-template.ts`) dan dibaca dari environment variables untuk data event-spesifik. Template awal pakai placeholder; klien bisa finalisasi belakangan dengan edit file dan redeploy.

```
Assalamu'alaikum / Salam sejahtera Bapak/Ibu *{nama}*,

Terima kasih telah memberikan sumbangsih untuk kegiatan
*{EVENT_NAME}*.

📋 *Detail Donasi Anda:*
• Nama: {nama}
• Alamat: {alamat}
• Total Donasi: Rp {nominal}

🎫 *Kupon Bingkisan ({jumlah_kupon} kupon):*
{list_kupon}

Kupon dapat ditukar dengan paket bingkisan pada
{EVENT_DATE} di {EVENT_LOCATION}.

Untuk pertanyaan, hubungi panitia di {ADMIN_PHONE}.

Hormat kami,
Panitia {EVENT_NAME}
```

Variable `{EVENT_NAME}`, `{EVENT_DATE}`, `{EVENT_LOCATION}`, `{ADMIN_PHONE}` di-inject dari env variables; placeholder lainnya (`{nama}`, `{nominal}`, dll) di-isi dari data peserta.

### 5.5 Modul Dashboard

- Total per kelompok: kupon dicetak, diasosiasikan, ditukar.
- Total nominal donasi keseluruhan & per kelompok.
- Status WhatsApp (terkirim, gagal, pending).
- Real-time update via Supabase Realtime.

### 5.6 Modul Autentikasi & Otorisasi

- Login email + password.
- Role: Admin, Petugas (dengan kelompok_id).
- Petugas hanya bisa akses kupon kelompoknya (enforced via Supabase RLS).

### 5.7 Modul Health Check (Anti Auto-Pause)

- Endpoint `/api/health-check` query ringan ke database.
- UptimeRobot ping setiap 5 menit.

## 6. Konfigurasi Environment Variables

Semua data event-spesifik dan secret keys disimpan di file `.env.local` (development) dan environment variables Vercel (production). Klien tidak perlu UI khusus untuk edit data ini — cukup edit env dan redeploy (otomatis < 1 menit di Vercel).

### File `.env.example`

```env
# ============================================
# EVENT CONFIGURATION (untuk display & WA template)
# ============================================
NEXT_PUBLIC_EVENT_NAME="Donasi ABC 2026"
NEXT_PUBLIC_EVENT_DATE="15 September 2026"
NEXT_PUBLIC_EVENT_LOCATION="Aula Masjid XYZ, Jl. Contoh No.1, Jakarta"
NEXT_PUBLIC_ADMIN_PHONE="+6281234567890"
NEXT_PUBLIC_APP_URL="https://aplikasi-donasi.vercel.app"

# ============================================
# SUPABASE (Database & Auth)
# ============================================
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."  # SECRET — backend only

# ============================================
# FONNTE WHATSAPP API
# ============================================
FONNTE_API_TOKEN="xxxxxxxxxxxxxxxx"  # SECRET — backend only
FONNTE_API_URL="https://api.fonnte.com/send"
FONNTE_DELAY_SECONDS=3  # delay antar pesan untuk hindari banned

# ============================================
# HEALTH CHECK
# ============================================
HEALTH_CHECK_SECRET="random-string-untuk-uptimerobot"  # opsional
```

**Catatan:**

- Variable dengan prefix `NEXT_PUBLIC_` akan terekspos ke browser (untuk dipakai di UI). Aman karena hanya nama event, tanggal, lokasi, dan nomor publik.
- Variable tanpa prefix hanya tersedia di backend (server). Wajib untuk secret seperti API token.
- Kalau ada perubahan nama event/tanggal/lokasi, tinggal edit di Vercel dashboard → Settings → Environment Variables → Save → auto-redeploy.

## 7. Data Model

### Tabel `kelompok`
```
id, nama, prefix, range_start, range_end, padding, created_at
```

### Tabel `users`
```
id, nama, email, password_hash, role, kelompok_id (nullable), created_at
```

### Tabel `peserta`
```
id, nama, alamat, no_whatsapp, nominal_donasi, kelompok_id,
wa_status, wa_sent_at, wa_attempt_count, created_at, created_by
```

### Tabel `kupon`
```
id, nomor_kupon (unique), kelompok_id, status,
peserta_id (nullable), assigned_at, assigned_by,
redeemed_at, redeemed_by
```

### Tabel `wa_log`
```
id, peserta_id, status, fonnte_response, error_message, sent_at
```

### Tabel `log_aktivitas`
```
id, user_id, aksi, tabel_terkait, record_id, detail (jsonb), created_at
```

## 8. Tech Stack & Biaya

| Komponen | Teknologi | Biaya (4 bulan) |
|----------|-----------|-----------------|
| Frontend & Backend | Next.js 14+ | Gratis |
| Database & Auth | Supabase (free tier) | Gratis |
| UI | Tailwind + shadcn/ui | Gratis |
| QR Scanner | html5-qrcode | Gratis |
| PWA | next-pwa | Gratis |
| Hosting | Vercel (free tier) | Gratis |
| Uptime Monitor | UptimeRobot | Gratis |
| WhatsApp Gateway | Fonnte | ~Rp 200-400rb total |
| **TOTAL** | | **~Rp 200-400rb** |

## 9. Solusi Supabase Auto-Pause

**Masalah:** Free tier auto-pause setelah 7 hari tanpa aktivitas.

**Solusi:** UptimeRobot ping `/api/health-check` setiap 5 menit. Project tetap aktif selamanya, gratis.

## 10. Strategi Pencegahan Banned WhatsApp (Fonnte)

### 10.1 Persiapan Nomor (KRITIS — Mulai dari Sekarang)

WhatsApp 2026 menerapkan **Reach-out Time-lock** untuk nomor baru. Strategi:

1. Beli/siapkan nomor panitia + nomor cadangan **sekarang** (Mei 2026).
2. Pakai natural 1-2 minggu (chat biasa, simpan kontak, terima/kirim pesan, join 1-2 grup).
3. Setelah ada history natural, baru sambungkan ke Fonnte.
4. Mulai kirim pelan-pelan (10-20 pesan/hari di awal).

### 10.2 Aturan Pengiriman

- Delay antar pesan: 3-5 detik (set di env `FONNTE_DELAY_SECONDS`).
- Pesan dipersonalisasi otomatis (template variabel).
- Validasi format nomor sebelum kirim.

### 10.3 Backup Plan

- Nomor cadangan kedua sudah di-warming up.
- Tombol "Kirim WA Manual" (link wa.me) sebagai fallback darurat.

## 11. Roadmap Pengembangan

| Tahap | Durasi | Deliverable |
|-------|--------|-------------|
| Setup project & auth | 2 hari | Next.js + Supabase + auth |
| Modul kelompok & generate kupon | 3 hari | Generate kupon dari range |
| Modul peserta + scan QR | 4 hari | Form + scan beruntun + validasi |
| Integrasi Fonnte | 2 hari | Auto kirim WA + retry + log |
| Modul scan penukaran | 2 hari | Validasi per kelompok |
| Dashboard & laporan | 2 hari | Statistik real-time |
| Health check + UptimeRobot | 0.5 hari | Anti auto-pause |
| PWA + responsive | 2 hari | Add to Home Screen |
| Testing & deployment | 2 hari | UAT + production |
| **Total** | **~3-4 minggu** | Sistem siap |

**Rekomendasi timeline:**
- Mei-Juni: development
- Juli: uji coba dengan data dummy + warming up nomor WhatsApp
- Agustus: mulai input data donatur real
- September: event distribusi

## 12. Checklist Pra-Launch

### Setup Teknis (Developer)
- [ ] Project Next.js + Supabase running di Vercel
- [ ] Database schema deployed
- [ ] RLS policies untuk per-kelompok access
- [ ] Environment variables di-set di Vercel
- [ ] UptimeRobot monitor aktif
- [ ] Fonnte account & device terhubung
- [ ] Template pesan WhatsApp di file `lib/wa-template.ts`

### Setup Operasional (Admin/Klien)
- [ ] Nomor WhatsApp panitia disiapkan (Mei 2026)
- [ ] Warming up nomor 1-2 minggu
- [ ] Nomor cadangan kedua di-warming up
- [ ] Akun admin & 6 kelompok dibuat
- [ ] Master kupon di-generate
- [ ] Verifikasi nomor kupon sistem = nomor kupon fisik dari percetakan
- [ ] Petugas dilatih (training ~30 menit)

## 13. Out of Scope (V1)

- Aplikasi native iOS/Android (cukup PWA).
- Pencetakan kupon dari sistem.
- Pendaftaran online mandiri.
- Integrasi payment gateway.
- Multi-event support.
- UI admin untuk edit konten WA template (pakai env + edit file untuk sekarang).

## 14. Status PRD

✅ **PRD ini FINAL dan siap untuk masuk tahap development.**

Semua spesifikasi sudah dikonfirmasi klien. Hal-hal yang akan disempurnakan sambil berjalan:
- Final wording template pesan WhatsApp.
- Detail UI (warna, layout) — akan diiterasi saat development.

Langkah selanjutnya:
1. Vendor/developer review PRD ini.
2. Developer setup project dan implementasi sesuai roadmap di Section 11.
3. Klien siapkan nomor WhatsApp panitia (CRITICAL — mulai sekarang).
