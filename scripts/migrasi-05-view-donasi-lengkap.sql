-- Migrasi 05: view baca `donasi_lengkap` + `wa_log.donasi_id`.
--
-- Halaman laporan & ekspor dulu membaca tabel `peserta`. View ini memberi
-- bentuk yang sama (nama kolom lama: nominal_donasi, registered_at, nama,
-- no_whatsapp, ...) tapi bersumber dari donasi + anggota + kegiatan, jadi
-- query lama cukup berganti sumber dan menambah filter kegiatan.
--
-- security_invoker: RLS donasi & anggota tetap berlaku untuk petugas.
-- Left join ke anggota supaya total uang petugas tidak berkurang ketika
-- anggotanya sudah pindah ke buku lain (barisnya tetap ada, nama kosong).
--
-- Idempoten.

alter table public.wa_log
  add column if not exists donasi_id uuid references public.donasi(id) on delete set null;
create index if not exists wa_log_donasi_idx on public.wa_log (donasi_id);
comment on column public.wa_log.donasi_id is 'Donasi yang tanda terimanya dikirim. Menggantikan peserta_id sejak model multi-kegiatan.';

update public.wa_log w
   set donasi_id = d.id
  from public.donasi d
 where d.peserta_id_lama = w.peserta_id
   and w.donasi_id is null;

create or replace view public.donasi_lengkap
with (security_invoker = on) as
select
  d.id,
  d.anggota_id,
  d.kegiatan_id,
  d.kelompok_id,
  d.nominal          as nominal_donasi,
  d.metode_bayar,
  d.bukti_transfer_path,
  d.tanggal          as registered_at,
  d.nomor_tt,
  d.wa_status,
  d.wa_sent_at,
  d.wa_attempt_count,
  d.keterangan,
  d.peserta_id_lama,
  d.created_at,
  d.created_by,
  a.nama,
  a.nama_hanzi,
  a.pinyin,
  a.alamat,
  a.no_whatsapp,
  a.kota_kabupaten,
  a.provinsi,
  a.jenis_usaha_id,
  a.wa_dikecualikan,
  a.wa_alasan_kecuali,
  a.buku_id,
  k.nama             as kegiatan_nama,
  k.aktif            as kegiatan_aktif
from public.donasi d
left join public.anggota a  on a.id = d.anggota_id
left join public.kegiatan k on k.id = d.kegiatan_id;

comment on view public.donasi_lengkap is 'Donasi + identitas anggota + nama kegiatan, dengan nama kolom lama (nominal_donasi, registered_at) supaya laporan/ekspor bekas tabel peserta tinggal berganti sumber. Hanya untuk BACA; tulis langsung ke donasi/anggota.';

grant select on public.donasi_lengkap to authenticated, service_role;
