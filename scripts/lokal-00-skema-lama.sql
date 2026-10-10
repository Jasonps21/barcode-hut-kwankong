-- =====================================================================
-- REPLIKA SKEMA LAMA UNTUK UJI COBA DI POSTGRES LOKAL
--
-- Bukan untuk dijalankan di produksi. Tujuannya hanya menyiapkan bak pasir
-- (sandbox) di komputer sendiri supaya migrasi-01 & migrasi-02 bisa diuji
-- memakai salinan data asli, tanpa menyentuh database produksi sama sekali.
--
-- Yang sengaja TIDAK ditiru: RLS, auth.users, dan storage — tidak relevan
-- untuk menguji kebenaran migrasi data. Fungsi auth.uid() dibuat tiruan
-- supaya policy di migrasi-01 tetap bisa dipasang tanpa error.
-- =====================================================================

create extension if not exists pgcrypto;

-- Tiruan schema auth milik Supabase (hanya yang dipakai policy).
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

-- Peran service_role dipakai di GRANT pada migrasi-01.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Tabel lama (disalin apa adanya dari struktur produksi)
-- ---------------------------------------------------------------------
create table if not exists public.kelompok (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  prefix      text not null unique,
  range_start int  not null,
  range_end   int  not null,
  padding     int  not null default 4,
  created_at  timestamptz default now()
);

create table if not exists public.profiles (
  id                 uuid primary key,
  nama               text not null,
  role               text not null,
  kelompok_id        uuid references public.kelompok(id),
  created_at         timestamptz default now(),
  can_edit_peserta   boolean not null default false,
  can_delete_peserta boolean not null default false
);

create table if not exists public.jenis_usaha (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.peserta (
  id                  uuid primary key default gen_random_uuid(),
  nama                text not null,
  alamat              text not null,
  no_whatsapp         text not null,
  nominal_donasi      numeric not null,
  kelompok_id         uuid references public.kelompok(id),
  wa_status           text default 'pending',
  wa_sent_at          timestamptz,
  wa_attempt_count    int default 0,
  created_at          timestamptz default now(),
  created_by          uuid references public.profiles(id),
  nama_hanzi          text,
  pinyin              text,
  metode_bayar        text,
  bukti_transfer_path text,
  registered_at       timestamptz,
  nomor_tt            bigint,
  kota_kabupaten      text,
  provinsi            text,
  jenis_usaha_id      uuid references public.jenis_usaha(id),
  keterangan          text
);

create table if not exists public.kupon (
  id          uuid primary key default gen_random_uuid(),
  nomor_kupon text not null unique,
  kelompok_id uuid references public.kelompok(id),
  status      text default 'available',
  peserta_id  uuid references public.peserta(id),
  assigned_at timestamptz,
  assigned_by uuid references public.profiles(id),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles(id)
);

create table if not exists public.peserta_nomor_usaha (
  id             uuid primary key default gen_random_uuid(),
  peserta_id     uuid not null references public.peserta(id) on delete cascade,
  label          text,
  nomor          text not null,
  sama_dengan_wa boolean not null default false,
  urutan         int not null default 0,
  created_at     timestamptz not null default now()
);
