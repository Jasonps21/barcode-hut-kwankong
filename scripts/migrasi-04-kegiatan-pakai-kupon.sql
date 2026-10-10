-- Migrasi 04: kegiatan boleh tanpa kupon.
--
-- Tidak semua kegiatan membagikan kupon. Sebagian hanya untuk MENCATAT berapa
-- yang disumbang anggota (mis. kegiatan yang sudah lewat). Untuk kegiatan
-- seperti itu form donasi tidak meminta kupon, dan server menolak kupon.
--
-- Default true supaya kegiatan yang sudah ada (Ultah Kwan Kong 2026) tetap
-- memakai kupon seperti biasa. Idempoten.

alter table public.kegiatan
  add column if not exists pakai_kupon boolean not null default true;

comment on column public.kegiatan.pakai_kupon is
  'false = kegiatan pencatatan saja (mis. donasi kegiatan yang sudah lewat). Form donasi tidak meminta kupon dan server menolak kupon untuk kegiatan ini.';
