-- Reset TRANSAKSI uji coba "scan pendaftaran" yang dilakukan pada 2026-07-01
-- (kemarin), TANPA menghapus peserta. Peserta pada kasus ini sudah ada
-- sebelumnya (diimpor) - yang terjadi kemarin hanyalah proses assign kupon
-- + isi data donasi ke peserta yang sudah ada (lihat
-- src/app/(dashboard)/scan-pendaftaran/actions.ts, registerExistingPesertaAction).
--
-- Patokan waktu yang dipakai adalah kolom `registered_at` pada peserta
-- (diisi persis saat transaksi scan-pendaftaran terjadi), BUKAN `created_at`
-- (itu tanggal peserta pertama kali diimpor/dibuat, jauh sebelum kemarin).
--
-- Cara pakai:
-- 1. Jalankan dulu bagian "STEP 0: PREVIEW" untuk memastikan jumlah baris
--    yang akan ter-reset sudah sesuai ekspektasi Anda.
-- 2. Jika sudah yakin, jalankan seluruh blok di dalam BEGIN...COMMIT.
-- 3. Skrip ini TIDAK menghapus peserta maupun kelompok/profiles.
-- 4. Kupon TIDAK dihapus, hanya dikembalikan ke status 'available'.
-- 5. File bukti transfer di Supabase Storage tidak ikut terhapus oleh
--    skrip ini - hapus manual dari bucket storage jika perlu.

-- =========================================================
-- STEP 0: PREVIEW (jalankan dulu, jangan langsung UPDATE/DELETE)
-- =========================================================
select id, nama, kelompok_id, nominal_donasi, metode_bayar, nomor_tt, registered_at
from public.peserta
where (registered_at at time zone 'Asia/Jakarta')::date = '2026-07-01';

select count(*) as jumlah_kupon_terkait
from public.kupon
where peserta_id in (
  select id from public.peserta
  where (registered_at at time zone 'Asia/Jakarta')::date = '2026-07-01'
);

select count(*) as jumlah_walog_terkait
from public.wa_log
where peserta_id in (
  select id from public.peserta
  where (registered_at at time zone 'Asia/Jakarta')::date = '2026-07-01'
)
and (sent_at at time zone 'Asia/Jakarta')::date = '2026-07-01';

-- =========================================================
-- STEP 1: EKSEKUSI (jalankan sebagai satu transaksi)
-- =========================================================
begin;

-- 1. Hapus log WhatsApp yang terkirim kemarin akibat transaksi uji coba ini
delete from public.wa_log
where peserta_id in (
  select id from public.peserta
  where (registered_at at time zone 'Asia/Jakarta')::date = '2026-07-01'
)
and (sent_at at time zone 'Asia/Jakarta')::date = '2026-07-01';

-- 2. Kembalikan kupon yang sempat ter-assign kemarin menjadi 'available'
--    lagi (bukan dihapus, karena nomor kupon adalah inventaris tetap
--    milik kelompok)
update public.kupon
set status = 'available',
    peserta_id = null,
    assigned_at = null,
    assigned_by = null,
    redeemed_at = null,
    redeemed_by = null
where peserta_id in (
  select id from public.peserta
  where (registered_at at time zone 'Asia/Jakarta')::date = '2026-07-01'
);

-- 3. Reset peserta yang sudah ada kembali ke kondisi "belum registrasi"
--    (peserta itu sendiri TIDAK dihapus)
update public.peserta
set nominal_donasi = 0,
    metode_bayar = null,
    bukti_transfer_path = null,
    wa_status = null,
    registered_at = null,
    nomor_tt = null
where (registered_at at time zone 'Asia/Jakarta')::date = '2026-07-01';

-- 4. Sinkronkan ulang sequence nomor tanda terima supaya penomoran
--    berikutnya melanjutkan dari nomor terakhir yang masih terpakai
--    (aman dijalankan meski tidak ada yang berubah)
select setval(
  'public.tanda_terima_seq',
  coalesce((select max(nomor_tt) from public.peserta), 0),
  true
);

commit;
