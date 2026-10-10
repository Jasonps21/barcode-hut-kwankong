-- =====================================================================
-- UJI SKENARIO — membuktikan 3 permintaan klien benar-benar bisa dilayani
-- oleh skema baru. Dijalankan di database SANDBOX, bukan produksi.
--
--   1. Riwayat sumbangan lintas kegiatan tampil untuk satu orang
--   2. Satu orang boleh menyumbang beberapa kali di kegiatan yang SAMA
--   3. Anggota pindah buku tanpa mengubah rekap setoran yang lama
--
-- Sekalian menguji: nomor kupon boleh dipakai ulang di kegiatan berikutnya,
-- nomor tanda terima mulai dari 1 lagi, dan hanya satu kegiatan boleh aktif.
-- =====================================================================
\set ON_ERROR_STOP on

\echo ''
\echo '=============== UJI A: kegiatan kedua boleh pakai nomor kupon yang sama ==============='

insert into public.kegiatan (nama, tahun, aktif, keterangan)
select 'Bakti Sosial Imlek 2027', 2027, false, 'Kegiatan kedua — uji coba.'
where not exists (select 1 from public.kegiatan where nama = 'Bakti Sosial Imlek 2027');

-- Pindahkan status aktif ke kegiatan baru (menguji "hanya satu boleh aktif").
update public.kegiatan set aktif = false where nama = 'Ulang Tahun Kwan Kong 2026';
update public.kegiatan set aktif = true  where nama = 'Bakti Sosial Imlek 2027';

-- Range kupon Buku 1 untuk kegiatan baru, memakai PREFIX YANG SAMA seperti 2026.
insert into public.kegiatan_kupon_range (kegiatan_id, kelompok_id, prefix, range_start, range_end, padding)
select k_baru.id, r.kelompok_id, r.prefix, 1, 50, r.padding
from public.kegiatan_kupon_range r
join public.kegiatan k_lama on k_lama.id = r.kegiatan_id and k_lama.nama = 'Ulang Tahun Kwan Kong 2026'
join public.kelompok kel    on kel.id = r.kelompok_id and kel.nama = 'BUKU 1'
cross join (select id from public.kegiatan where nama = 'Bakti Sosial Imlek 2027') k_baru
on conflict (kegiatan_id, kelompok_id) do nothing;

-- Cetak kupon nomor 1..3 untuk kegiatan baru. Nomornya PERSIS SAMA dengan
-- kupon yang sudah ada di kegiatan 2026 — dulu ini ditolak database.
insert into public.kupon (nomor_kupon, kelompok_id, kegiatan_id, status)
select r.prefix || lpad(g::text, r.padding, '0'), r.kelompok_id, r.kegiatan_id, 'available'
from public.kegiatan_kupon_range r
join public.kegiatan k on k.id = r.kegiatan_id and k.nama = 'Bakti Sosial Imlek 2027'
cross join generate_series(1, 3) g
on conflict do nothing;

select k.nama as kegiatan, ku.nomor_kupon, ku.status
from public.kupon ku
join public.kegiatan k on k.id = ku.kegiatan_id
where ku.nomor_kupon in (
  select r.prefix || lpad(g::text, r.padding, '0')
  from public.kegiatan_kupon_range r
  join public.kegiatan k2 on k2.id = r.kegiatan_id and k2.nama = 'Bakti Sosial Imlek 2027'
  cross join generate_series(1, 3) g
)
order by ku.nomor_kupon, k.tahun;

\echo ''
\echo '=============== UJI B: hanya satu kegiatan boleh aktif ==============='
do $$
begin
  update public.kegiatan set aktif = true where nama = 'Ulang Tahun Kwan Kong 2026';
  raise exception 'GAGAL: dua kegiatan aktif bersamaan seharusnya ditolak database';
exception
  when unique_violation then
    raise notice 'BENAR: database menolak kegiatan aktif kedua.';
end $$;

\echo ''
\echo '=============== UJI C: satu orang menyumbang DUA KALI di kegiatan yang sama ==============='
-- Ambil satu anggota yang sudah punya riwayat di kegiatan 2026.
-- Sengaja dari BUKU 1, supaya uji pindah buku di UJI E benar-benar berpindah
-- (kalau anggotanya sudah di buku tujuan, ujinya tidak membuktikan apa pun).
create temporary table uji_anggota as
select a.id, a.nama, a.buku_id
from public.anggota a
join public.donasi d   on d.anggota_id = a.id
join public.kegiatan k on k.id = d.kegiatan_id and k.nama = 'Ulang Tahun Kwan Kong 2026'
join public.kelompok kel on kel.id = a.buku_id and kel.nama = 'BUKU 1'
order by d.nominal desc
limit 1;

-- Setoran pertama di kegiatan Imlek.
with baru as (
  insert into public.donasi (anggota_id, kegiatan_id, kelompok_id, nominal, metode_bayar, tanggal)
  select u.id, k.id, u.buku_id, 1000000, 'cash', '2027-01-15'::timestamptz
  from uji_anggota u cross join public.kegiatan k where k.nama = 'Bakti Sosial Imlek 2027'
  returning id
)
select public.assign_nomor_tt_donasi(id) as tt_setoran_1 from baru;

-- Beberapa hari kemudian dapat rejeki, menyumbang LAGI di kegiatan yang sama.
with baru as (
  insert into public.donasi (anggota_id, kegiatan_id, kelompok_id, nominal, metode_bayar, tanggal, keterangan)
  select u.id, k.id, u.buku_id, 500000, 'transfer', '2027-01-24'::timestamptz, 'Tambahan setelah dapat rejeki'
  from uji_anggota u cross join public.kegiatan k where k.nama = 'Bakti Sosial Imlek 2027'
  returning id
)
select public.assign_nomor_tt_donasi(id) as tt_setoran_2 from baru;

\echo '-- Nomor tanda terima kegiatan baru harus mulai dari 1, bukan lanjut dari 2026 --'
select k.nama as kegiatan, d.nomor_tt, d.tanggal::date, d.nominal, d.metode_bayar
from public.donasi d
join public.kegiatan k on k.id = d.kegiatan_id
where d.anggota_id = (select id from uji_anggota) and k.nama = 'Bakti Sosial Imlek 2027'
order by d.nomor_tt;

\echo ''
\echo '=============== UJI D: riwayat lintas kegiatan (yang dibacakan petugas saat menagih) ==============='
select
  a.nama                                as anggota,
  kel.nama                              as buku_saat_itu,
  k.nama                                as kegiatan,
  to_char(d.tanggal, 'DD Mon YYYY')     as tanggal,
  to_char(d.nominal, 'FM999G999G999')   as nominal,
  (select count(*) from public.kupon ku where ku.donasi_id = d.id) as kupon
from public.donasi d
join public.anggota  a   on a.id  = d.anggota_id
join public.kegiatan k   on k.id  = d.kegiatan_id
join public.kelompok kel on kel.id = d.kelompok_id
where d.anggota_id = (select id from uji_anggota)
order by d.tanggal;

\echo ''
\echo '=============== UJI E: pindah buku — rekap lama TIDAK boleh berubah ==============='
\echo '-- Total per buku SEBELUM pindah --'
create temporary table uji_sebelum as
select kel.nama as buku, sum(d.nominal) total
from public.donasi d join public.kelompok kel on kel.id = d.kelompok_id
group by kel.nama;
select * from uji_sebelum order by buku;

-- Pindahkan anggota uji ke BUKU 6, lengkap dengan catatan riwayatnya.
insert into public.anggota_buku_riwayat (anggota_id, dari_buku_id, ke_buku_id, alasan)
select u.id, u.buku_id, (select id from public.kelompok where nama = 'BUKU 6'), 'Uji coba pindah buku'
from uji_anggota u;

update public.anggota
   set buku_id = (select id from public.kelompok where nama = 'BUKU 6')
 where id = (select id from uji_anggota);

\echo '-- Total per buku SESUDAH pindah: selisih harus NOL di semua baris --'
select s.buku, s.total as sebelum, coalesce(t.total, 0) as sesudah,
       s.total - coalesce(t.total, 0) as selisih_harus_nol
from uji_sebelum s
left join (
  select kel.nama as buku, sum(d.nominal) total
  from public.donasi d join public.kelompok kel on kel.id = d.kelompok_id
  group by kel.nama
) t on t.buku = s.buku
order by s.buku;

\echo '-- Buku anggota sekarang vs buku pada donasi lamanya --'
select a.nama, kel_now.nama as buku_sekarang, kel_old.nama as buku_pada_donasi_lama, k.nama as kegiatan
from public.anggota a
join public.kelompok kel_now on kel_now.id = a.buku_id
join public.donasi d on d.anggota_id = a.id
join public.kelompok kel_old on kel_old.id = d.kelompok_id
join public.kegiatan k on k.id = d.kegiatan_id
where a.id = (select id from uji_anggota)
order by d.tanggal;
