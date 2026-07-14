-- Tambah kolom Kota/Kabupaten, Provinsi, Jenis Usaha, Keterangan ke tabel peserta.
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run.

-- Tabel master jenis usaha (supaya kategori tidak dobel/typo). Bisa ditambah
-- sendiri lewat combobox di form peserta ("ketik baru" -> insert ke tabel ini).
create table if not exists public.jenis_usaha (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.jenis_usaha is 'Master kategori jenis usaha peserta (Bahan Bangunan, Furniture, dst). Diisi awal + bisa ditambah user lewat combobox creatable.';

insert into public.jenis_usaha (nama) values
  ('Bahan Bangunan'),
  ('Furniture'),
  ('Electronic'),
  ('Jasa Service Elektronik'),
  ('Laundry'),
  ('Percetakan')
on conflict (nama) do nothing;

alter table public.peserta
  add column if not exists kota_kabupaten text,
  add column if not exists provinsi       text,
  add column if not exists jenis_usaha_id uuid references public.jenis_usaha(id),
  add column if not exists keterangan     text;

comment on column public.peserta.kota_kabupaten is 'Kota/Kabupaten domisili peserta';
comment on column public.peserta.provinsi       is 'Provinsi domisili peserta';
comment on column public.peserta.jenis_usaha_id is 'Referensi ke public.jenis_usaha — kategori jenis usaha peserta';
comment on column public.peserta.keterangan     is 'Keterangan bebas: merk/tipe barang yang dijual (mis. TV LG, Genset Yamaha)';

-- RLS: jenis_usaha adalah master data bersama, semua user login boleh baca.
-- Insert kategori baru (creatable combobox) juga dibolehkan untuk semua user
-- login yang berhak input peserta (admin & petugas_pendaftaran) — dicek lagi
-- di server action, RLS di sini hanya baseline.
alter table public.jenis_usaha enable row level security;

drop policy if exists jenis_usaha_select on public.jenis_usaha;
create policy jenis_usaha_select on public.jenis_usaha
  for select to authenticated
  using (true);

drop policy if exists jenis_usaha_insert on public.jenis_usaha;
create policy jenis_usaha_insert on public.jenis_usaha
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'petugas_pendaftaran')
    )
  );
