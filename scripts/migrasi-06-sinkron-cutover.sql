-- =====================================================================
-- MIGRASI 06 — SINKRON ULANG SAAT CUTOVER (jalankan TEPAT saat deploy)
--
-- Antara migrasi-02 dan deploy kode baru, aplikasi lama tetap menulis ke
-- `peserta`: pendaftaran baru, nominal yang diedit admin, kupon yang
-- di-assign, status WA dari cron. Skrip ini menyusulkan semuanya ke
-- anggota/donasi, lalu mengunci nomor kupon per kegiatan.
--
-- Urutan deploy:
--   1. Jalankan backup:  node scripts/backup-produksi.cjs
--   2. Jalankan migrasi-02 BAGIAN 0–5 lagi (aman diulang) — baris peserta
--      BARU ikut terbentuk jadi anggota + donasi.
--   3. Jalankan skrip INI.
--   4. Deploy kode baru.
--
-- Hanya menyentuh baris hasil migrasi (punya peserta_id_lama / migrasi_kunci).
-- Data yang dibuat lewat aplikasi baru tidak disentuh. Idempoten.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Nilai setoran mengikuti peserta (nominal diedit admin, status WA dari
--    cron, nomor TT yang baru diambil, bukti yang diunggah belakangan).
-- ---------------------------------------------------------------------
update public.donasi d
   set nominal             = p.nominal_donasi,
       metode_bayar        = coalesce(p.metode_bayar, 'cash'),
       bukti_transfer_path = p.bukti_transfer_path,
       tanggal             = coalesce(p.registered_at, p.created_at),
       nomor_tt            = coalesce(p.nomor_tt, d.nomor_tt),
       wa_status           = coalesce(p.wa_status, 'not_sent'),
       wa_sent_at          = p.wa_sent_at,
       wa_attempt_count    = coalesce(p.wa_attempt_count, 0),
       kelompok_id         = p.kelompok_id
  from public.peserta p
 where d.peserta_id_lama = p.id
   and coalesce(p.nominal_donasi, 0) > 0
   and (d.nominal, d.metode_bayar, d.bukti_transfer_path, d.tanggal, d.nomor_tt,
        d.wa_status, d.wa_sent_at, d.wa_attempt_count, d.kelompok_id)
       is distinct from
       (p.nominal_donasi, coalesce(p.metode_bayar, 'cash'), p.bukti_transfer_path,
        coalesce(p.registered_at, p.created_at), coalesce(p.nomor_tt, d.nomor_tt),
        coalesce(p.wa_status, 'not_sent'), p.wa_sent_at, coalesce(p.wa_attempt_count, 0), p.kelompok_id);

-- ---------------------------------------------------------------------
-- 2. Identitas anggota mengikuti baris peserta induknya (nama/alamat/WA
--    yang diperbaiki di aplikasi lama).
-- ---------------------------------------------------------------------
update public.anggota a
   set nama              = p.nama,
       nama_hanzi        = p.nama_hanzi,
       pinyin            = p.pinyin,
       alamat            = p.alamat,
       no_whatsapp       = p.no_whatsapp,
       kota_kabupaten    = p.kota_kabupaten,
       provinsi          = p.provinsi,
       jenis_usaha_id    = p.jenis_usaha_id,
       keterangan        = p.keterangan,
       wa_dikecualikan   = coalesce(p.wa_dikecualikan, false),
       wa_alasan_kecuali = p.wa_alasan_kecuali
  from public.migrasi_peserta_anggota m
  join public.peserta p on p.id = m.peserta_id
 where m.anggota_id = a.id
   and m.induk
   and a.migrasi_kunci is not null
   and (a.nama, a.nama_hanzi, a.pinyin, a.alamat, a.no_whatsapp, a.kota_kabupaten,
        a.provinsi, a.jenis_usaha_id, a.keterangan, a.wa_dikecualikan, a.wa_alasan_kecuali)
       is distinct from
       (p.nama, p.nama_hanzi, p.pinyin, p.alamat, p.no_whatsapp, p.kota_kabupaten,
        p.provinsi, p.jenis_usaha_id, p.keterangan, coalesce(p.wa_dikecualikan, false), p.wa_alasan_kecuali);

-- Nomor usaha: ganti seluruhnya untuk anggota hasil migrasi.
delete from public.anggota_nomor_usaha n
 using public.anggota a
 where n.anggota_id = a.id and a.migrasi_kunci is not null;

insert into public.anggota_nomor_usaha (anggota_id, label, nomor, sama_dengan_wa, urutan, created_at)
select m.anggota_id, n.label, n.nomor, n.sama_dengan_wa, n.urutan, n.created_at
from public.peserta_nomor_usaha n
join public.migrasi_peserta_anggota m on m.peserta_id = n.peserta_id
where not exists (
  select 1 from public.anggota_nomor_usaha x
  where x.anggota_id = m.anggota_id and x.nomor = n.nomor
);

-- ---------------------------------------------------------------------
-- 3. Kupon: kegiatan untuk kupon yang dibuat aplikasi lama, lalu kepemilikan
--    mengikuti peserta_id. Kupon yang dilepas di aplikasi lama ikut lepas —
--    tapi HANYA bila sambungannya berasal dari migrasi, bukan dari setoran
--    yang dicatat lewat aplikasi baru.
-- ---------------------------------------------------------------------
update public.kupon
   set kegiatan_id = (select id from public.kegiatan where nama = 'Ulang Tahun Kwan Kong 2026')
 where kegiatan_id is null;

update public.kupon k
   set donasi_id = d.id
  from public.donasi d
 where d.peserta_id_lama = k.peserta_id
   and k.donasi_id is distinct from d.id;

update public.kupon k
   set donasi_id = null
  from public.donasi d
 where k.donasi_id = d.id
   and d.peserta_id_lama is not null
   and k.peserta_id is null;

-- ---------------------------------------------------------------------
-- 4. Log WA & counter nomor tanda terima.
-- ---------------------------------------------------------------------
update public.wa_log w
   set donasi_id = d.id
  from public.donasi d
 where d.peserta_id_lama = w.peserta_id
   and w.donasi_id is null;

update public.kegiatan k
   set tt_terakhir = greatest(
         k.tt_terakhir,
         coalesce((select max(d.nomor_tt) from public.donasi d where d.kegiatan_id = k.id), 0))
 where k.nama = 'Ulang Tahun Kwan Kong 2026';

commit;

-- =====================================================================
-- 5. PENGETATAN KUPON (bagian 6 migrasi-02 yang sengaja ditunda).
-- Setelah ini aplikasi LAMA tidak bisa lagi membuat kupon — jadi wajib
-- dijalankan bersamaan dengan deploy kode baru, bukan sebelumnya.
-- =====================================================================
begin;

alter table public.kupon alter column kegiatan_id set not null;

create unique index if not exists kupon_nomor_per_kegiatan
  on public.kupon (kegiatan_id, nomor_kupon);

alter table public.kupon drop constraint if exists kupon_nomor_kupon_key;

commit;

-- =====================================================================
-- 6. PEMERIKSAAN — semua kolom *_harus_nol wajib 0.
-- =====================================================================
select
  (select coalesce(sum(nominal_donasi), 0) from public.peserta)
    - (select coalesce(sum(nominal), 0) from public.donasi where peserta_id_lama is not null)       as selisih_uang_harus_nol,
  (select count(*) from public.peserta where coalesce(nominal_donasi, 0) > 0)
    - (select count(*) from public.donasi where peserta_id_lama is not null)                        as selisih_setoran_harus_nol,
  (select count(*) from public.peserta p
     where not exists (select 1 from public.migrasi_peserta_anggota m where m.peserta_id = p.id))    as peserta_belum_terpetakan_harus_nol,
  (select count(*) from public.kupon where peserta_id is not null and donasi_id is null)             as kupon_putus_harus_nol,
  -- Setoran hasil migrasi yang pesertanya kini bernominal 0 (dihapus/dinolkan
  -- di aplikasi lama). Tidak dihapus otomatis — periksa manual bila > 0.
  (select count(*) from public.donasi d join public.peserta p on p.id = d.peserta_id_lama
     where coalesce(p.nominal_donasi, 0) = 0)                                                        as donasi_yatim_periksa_manual;
