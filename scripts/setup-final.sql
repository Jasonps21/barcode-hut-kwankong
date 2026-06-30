-- =====================================================================
-- SETUP FINAL — jalankan sekali di Supabase SQL Editor -> Run.
-- Idempoten (aman diulang).
--   1) Kolom metode_bayar (cash/transfer) di peserta
--   2) Policy RLS SELECT agar aplikasi bisa menampilkan data
-- =====================================================================

-- 1) Kolom metode bayar + bukti transfer --------------------------------
alter table public.peserta
  add column if not exists metode_bayar text,
  add column if not exists bukti_transfer_path text,
  add column if not exists registered_at timestamptz,
  add column if not exists nomor_tt bigint;

-- Nomor tanda terima sekuensial (auto-increment) + fungsi assign yang atomic.
create sequence if not exists public.tanda_terima_seq;

create or replace function public.assign_nomor_tt(p_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v bigint;
begin
  update public.peserta set nomor_tt = nextval('public.tanda_terima_seq')
    where id = p_id and nomor_tt is null
    returning nomor_tt into v;
  if v is null then
    select nomor_tt into v from public.peserta where id = p_id;
  end if;
  return v;
end $$;

grant execute on function public.assign_nomor_tt(uuid) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'peserta_metode_bayar_check'
  ) then
    alter table public.peserta
      add constraint peserta_metode_bayar_check
      check (metode_bayar in ('cash','transfer'));
  end if;
end $$;

-- 2) RLS SELECT policies ------------------------------------------------
alter table public.peserta  enable row level security;
alter table public.kelompok enable row level security;
alter table public.kupon    enable row level security;

drop policy if exists peserta_select on public.peserta;
create policy peserta_select on public.peserta
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.kelompok_id = peserta.kelompok_id)
  ));

drop policy if exists kelompok_select on public.kelompok;
create policy kelompok_select on public.kelompok
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.kelompok_id = kelompok.id)
  ));

drop policy if exists kupon_select on public.kupon;
create policy kupon_select on public.kupon
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.kelompok_id = kupon.kelompok_id)
  ));
