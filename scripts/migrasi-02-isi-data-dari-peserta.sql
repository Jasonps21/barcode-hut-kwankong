-- =====================================================================
-- MIGRASI 02 — PINDAHKAN ISI `peserta` KE `anggota` + `donasi`
--
-- Prasyarat: migrasi-01 sudah dijalankan.
-- Sifat: hanya MENULIS ke tabel baru + mengisi 2 kolom baru di `kupon`.
--        Isi tabel `peserta` sama sekali tidak diubah (tetap jadi rujukan
--        pembanding kalau ada selisih angka).
-- Idempoten: aman diulang — pemetaan disimpan di migrasi_peserta_anggota.
--
-- ATURAN PENGGABUNGAN (sengaja KONSERVATIF)
-- Dua baris peserta dianggap orang yang sama HANYA kalau nomor WA-nya sah,
-- sama persis, DAN namanya sama persis. Selain itu dibiarkan terpisah.
--
-- Alasannya, dari pemeriksaan data nyata per Agustus 2026:
--   * 382 baris memakai nomor WA "0" dan 15 baris "000000" — itu isian
--     penampung, bukan nomor asli. Menggabung atas dasar ini akan
--     meleburkan 376 orang berbeda menjadi satu.
--   * Beberapa nomor asli dipakai bersama satu keluarga (mis. 6 baris
--     keluarga RYANTO, 6 baris keluarga SUYANTHIO) — orangnya memang beda.
-- Maka nomor yang panjangnya di luar 9-15 digit, atau isinya nol semua,
-- TIDAK dipakai sebagai dasar penggabungan.
--
-- Perkiraan hasil: hanya ~4 kelompok (10 baris) tergabung otomatis.
-- Kandidat lain yang masih meragukan TIDAK digabung diam-diam di sini —
-- dikeluarkan sebagai laporan lewat scripts/laporan-kandidat-gabung.cjs
-- untuk diputuskan klien.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- BAGIAN 0 — Alat bantu pemetaan supaya skrip bisa diulang tanpa dobel
-- ---------------------------------------------------------------------
create table if not exists public.migrasi_peserta_anggota (
  peserta_id uuid primary key references public.peserta(id),
  anggota_id uuid not null references public.anggota(id),
  induk      boolean not null default false,  -- baris sumber identitas anggota
  created_at timestamptz not null default now()
);

comment on table public.migrasi_peserta_anggota is 'Peta baris peserta lama -> anggota baru. Dipakai agar migrasi bisa diulang dan agar selisih angka bisa ditelusuri balik ke data lama.';

create index if not exists migrasi_peserta_anggota_anggota_idx
  on public.migrasi_peserta_anggota (anggota_id);

-- Kunci sementara pada `anggota`: dipakai untuk menyambungkan baris hasil
-- INSERT ke grup asalnya secara PASTI. Tidak boleh mengandalkan urutan baris
-- yang dikembalikan INSERT — Postgres tidak menjamin urutan itu.
alter table public.anggota add column if not exists migrasi_kunci text;
create unique index if not exists anggota_migrasi_kunci_unik
  on public.anggota (migrasi_kunci) where migrasi_kunci is not null;

-- ---------------------------------------------------------------------
-- BAGIAN 1 — Kegiatan untuk data lama + range kupon per buku
-- ---------------------------------------------------------------------
insert into public.kegiatan (nama, tahun, tanggal_mulai, aktif, keterangan)
select 'Ulang Tahun Kwan Kong 2026', 2026,
       (select min(coalesce(registered_at, created_at))::date from public.peserta),
       true,
       'Kegiatan pertama — hasil migrasi dari tabel peserta lama.'
where not exists (select 1 from public.kegiatan where nama = 'Ulang Tahun Kwan Kong 2026');

insert into public.kegiatan_kupon_range (kegiatan_id, kelompok_id, prefix, range_start, range_end, padding)
select keg.id, kel.id, kel.prefix, kel.range_start, kel.range_end, coalesce(kel.padding, 4)
from public.kelompok kel
cross join (select id from public.kegiatan where nama = 'Ulang Tahun Kwan Kong 2026') keg
on conflict (kegiatan_id, kelompok_id) do nothing;

-- ---------------------------------------------------------------------
-- BAGIAN 2 — Bentuk `anggota` dari `peserta`
-- ---------------------------------------------------------------------
create temporary table tmp_grup on commit drop as
with dasar as (
  select p.*,
         case
           when regexp_replace(coalesce(p.no_whatsapp, ''), '\D', '', 'g') ~ '^[0-9]{9,15}$'
            and regexp_replace(coalesce(p.no_whatsapp, ''), '\D', '', 'g') !~ '^0+$'
           then regexp_replace(coalesce(p.no_whatsapp, ''), '\D', '', 'g')
         end as wa_sah
  from public.peserta p
  where not exists (select 1 from public.migrasi_peserta_anggota m where m.peserta_id = p.id)
),
berkunci as (
  -- WA tidak sah -> kunci unik per baris, jadi baris itu tidak akan tergabung.
  select d.*,
         case when d.wa_sah is not null
              then 'wa:' || d.wa_sah || '|' || lower(btrim(d.nama))
              else 'baris:' || d.id::text
         end as kunci
  from dasar d
)
select
  kunci,
  -- Ambil nilai pertama yang tidak kosong, urut dari baris terlama, supaya
  -- kolom yang kosong di satu baris bisa terisi dari baris lain segrup.
  (array_agg(nama           order by created_at, id))[1]                                                             as nama,
  (array_agg(nama_hanzi     order by created_at, id) filter (where nullif(btrim(nama_hanzi),'')     is not null))[1]  as nama_hanzi,
  (array_agg(pinyin         order by created_at, id) filter (where nullif(btrim(pinyin),'')         is not null))[1]  as pinyin,
  (array_agg(alamat         order by created_at, id) filter (where nullif(btrim(alamat),'')         is not null))[1]  as alamat,
  (array_agg(no_whatsapp    order by created_at, id) filter (where nullif(btrim(no_whatsapp),'')    is not null))[1]  as no_whatsapp,
  (array_agg(kota_kabupaten order by created_at, id) filter (where nullif(btrim(kota_kabupaten),'') is not null))[1]  as kota_kabupaten,
  (array_agg(provinsi       order by created_at, id) filter (where nullif(btrim(provinsi),'')       is not null))[1]  as provinsi,
  (array_agg(jenis_usaha_id order by created_at, id) filter (where jenis_usaha_id is not null))[1]                    as jenis_usaha_id,
  (array_agg(keterangan     order by created_at, id) filter (where nullif(btrim(keterangan),'')     is not null))[1]  as keterangan,
  (array_agg(kelompok_id    order by created_at, id))[1]                                                             as buku_id,
  -- Kalau salah satu baris segrup dikecualikan, anggota gabungannya ikut
  -- dikecualikan. Lebih aman salah diam daripada salah kirim.
  bool_or(coalesce(wa_dikecualikan, false))                                                                          as wa_dikecualikan,
  (array_agg(wa_alasan_kecuali order by created_at, id) filter (where nullif(btrim(wa_alasan_kecuali),'') is not null))[1] as wa_alasan_kecuali,
  (array_agg(created_by     order by created_at, id) filter (where created_by is not null))[1]                        as created_by,
  min(created_at)                                                                                                    as created_at,
  (array_agg(id             order by created_at, id))[1]                                                             as peserta_induk_id,
  array_agg(id)                                                                                                      as semua_peserta_id
from berkunci
group by kunci;

insert into public.anggota (
  migrasi_kunci, nama, nama_hanzi, pinyin, alamat, no_whatsapp, kota_kabupaten,
  provinsi, jenis_usaha_id, keterangan, buku_id, wa_dikecualikan,
  wa_alasan_kecuali, created_at, created_by
)
select kunci, nama, nama_hanzi, pinyin, alamat, no_whatsapp, kota_kabupaten,
       provinsi, jenis_usaha_id, keterangan, buku_id, wa_dikecualikan,
       wa_alasan_kecuali, created_at, created_by
from tmp_grup
on conflict (migrasi_kunci) where migrasi_kunci is not null do nothing;

-- Pemetaan dicocokkan lewat `migrasi_kunci`, bukan lewat urutan baris.
insert into public.migrasi_peserta_anggota (peserta_id, anggota_id, induk)
select pid, a.id, pid = g.peserta_induk_id
from tmp_grup g
join public.anggota a on a.migrasi_kunci = g.kunci
cross join lateral unnest(g.semua_peserta_id) as u(pid)
on conflict (peserta_id) do nothing;

-- ---------------------------------------------------------------------
-- BAGIAN 3 — Bentuk `donasi` dari peserta yang benar-benar menyetor
--
-- 364 baris peserta bernominal 0/kosong = anggota yang terdaftar tapi belum
-- menyetor. Mereka tetap jadi `anggota`, tapi TIDAK dibuatkan baris donasi.
-- Sudah diperiksa: tidak ada satu pun dari mereka yang memegang kupon.
-- ---------------------------------------------------------------------
insert into public.donasi (
  anggota_id, kegiatan_id, kelompok_id, nominal, metode_bayar,
  bukti_transfer_path, tanggal, nomor_tt, wa_status, wa_sent_at,
  wa_attempt_count, peserta_id_lama, created_at, created_by
)
select
  m.anggota_id,
  keg.id,
  p.kelompok_id,
  p.nominal_donasi,
  -- Beberapa baris lama tidak mencatat metode bayar. Dianggap cash karena
  -- transfer selalu mensyaratkan bukti, dan baris ini tidak punya bukti.
  coalesce(p.metode_bayar, 'cash'),
  p.bukti_transfer_path,
  coalesce(p.registered_at, p.created_at),
  p.nomor_tt,
  coalesce(p.wa_status, 'not_sent'),
  p.wa_sent_at,
  coalesce(p.wa_attempt_count, 0),
  p.id,
  p.created_at,
  p.created_by
from public.peserta p
join public.migrasi_peserta_anggota m on m.peserta_id = p.id
cross join (select id from public.kegiatan where nama = 'Ulang Tahun Kwan Kong 2026') keg
where coalesce(p.nominal_donasi, 0) > 0
on conflict (peserta_id_lama) where peserta_id_lama is not null do nothing;

-- Lanjutkan penomoran tanda terima dari nomor tertinggi yang sudah terpakai,
-- supaya donasi baru di kegiatan ini tidak memakai nomor yang sudah ada.
update public.kegiatan k
   set tt_terakhir = greatest(
         k.tt_terakhir,
         coalesce((select max(d.nomor_tt) from public.donasi d where d.kegiatan_id = k.id), 0))
 where k.nama = 'Ulang Tahun Kwan Kong 2026';

-- ---------------------------------------------------------------------
-- BAGIAN 4 — Sambungkan `kupon` ke kegiatan & donasi
-- ---------------------------------------------------------------------
update public.kupon k
   set kegiatan_id = (select id from public.kegiatan where nama = 'Ulang Tahun Kwan Kong 2026')
 where k.kegiatan_id is null;

update public.kupon k
   set donasi_id = d.id
  from public.donasi d
 where d.peserta_id_lama = k.peserta_id
   and k.donasi_id is null;

-- ---------------------------------------------------------------------
-- BAGIAN 5 — Nomor usaha ikut pindah ke anggota
-- ---------------------------------------------------------------------
insert into public.anggota_nomor_usaha (anggota_id, label, nomor, sama_dengan_wa, urutan, created_at)
select m.anggota_id, n.label, n.nomor, n.sama_dengan_wa, n.urutan, n.created_at
from public.peserta_nomor_usaha n
join public.migrasi_peserta_anggota m on m.peserta_id = n.peserta_id
where not exists (
  select 1 from public.anggota_nomor_usaha a
  where a.anggota_id = m.anggota_id and a.nomor = n.nomor
);

commit;

-- =====================================================================
-- BAGIAN 6 — PENGETATAN CONSTRAINT KUPON
--
-- Dijalankan SETELAH kegiatan_id terisi semua, supaya tidak ada jeda waktu
-- di mana nomor kupon tidak terlindungi dari duplikat.
-- Setelah ini, kegiatan berikutnya boleh mencetak nomor A0001 lagi.
-- =====================================================================
begin;

alter table public.kupon alter column kegiatan_id set not null;

create unique index if not exists kupon_nomor_per_kegiatan
  on public.kupon (kegiatan_id, nomor_kupon);

alter table public.kupon drop constraint if exists kupon_nomor_kupon_key;

commit;

-- =====================================================================
-- BAGIAN 7 — PEMERIKSAAN HASIL (jalankan & bandingkan angkanya)
-- =====================================================================
\echo '--- Jumlah baris ---'
select
  (select count(*) from public.peserta)                                as peserta_lama,
  (select count(*) from public.anggota)                                as anggota_baru,
  (select count(*) from public.migrasi_peserta_anggota)                as terpetakan,
  (select count(*) from public.peserta where coalesce(nominal_donasi,0) > 0) as peserta_menyetor,
  (select count(*) from public.donasi)                                 as donasi_baru;

\echo '--- Total uang HARUS sama persis ---'
select
  (select coalesce(sum(nominal_donasi),0) from public.peserta) as total_lama,
  (select coalesce(sum(nominal),0)        from public.donasi)  as total_baru,
  (select coalesce(sum(nominal_donasi),0) from public.peserta)
    - (select coalesce(sum(nominal),0) from public.donasi)     as selisih_harus_nol;

\echo '--- Total uang per buku HARUS sama persis ---'
select kel.nama,
       coalesce(l.total, 0) as total_lama,
       coalesce(b.total, 0) as total_baru,
       coalesce(l.total,0) - coalesce(b.total,0) as selisih_harus_nol
from public.kelompok kel
left join (select kelompok_id, sum(nominal_donasi) total from public.peserta group by 1) l on l.kelompok_id = kel.id
left join (select kelompok_id, sum(nominal)        total from public.donasi  group by 1) b on b.kelompok_id = kel.id
order by kel.nama;

\echo '--- Kupon HARUS tersambung semua ---'
select
  (select count(*) from public.kupon)                                              as kupon_total,
  (select count(*) from public.kupon where kegiatan_id is null)                    as tanpa_kegiatan_harus_nol,
  (select count(*) from public.kupon where peserta_id is not null)                 as kupon_terpakai_lama,
  (select count(*) from public.kupon where donasi_id is not null)                  as kupon_tersambung_baru,
  (select count(*) from public.kupon where peserta_id is not null and donasi_id is null) as putus_harus_nol;

\echo '--- Anggota hasil penggabungan (untuk diperiksa mata) ---'
select a.nama, a.no_whatsapp, count(m.peserta_id) as jumlah_baris_lama
from public.anggota a
join public.migrasi_peserta_anggota m on m.anggota_id = a.id
group by a.id, a.nama, a.no_whatsapp
having count(m.peserta_id) > 1
order by count(m.peserta_id) desc;
