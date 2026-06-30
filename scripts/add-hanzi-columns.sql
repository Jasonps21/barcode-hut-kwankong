-- Tambah kolom Nama Hanzi + Pinyin ke tabel peserta.
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run.

alter table public.peserta
  add column if not exists nama_hanzi text,
  add column if not exists pinyin     text;

comment on column public.peserta.nama_hanzi is 'Nama dalam karakter Hanzi (opsional)';
comment on column public.peserta.pinyin     is 'Romanisasi pinyin dari nama_hanzi (otomatis)';
