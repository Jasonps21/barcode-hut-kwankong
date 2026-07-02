-- =====================================================================
-- Tabel error_logs: menyimpan error aplikasi (server & client) supaya
-- bisa dibaca langsung dari menu "Log Error" di aplikasi, tanpa
-- bergantung pada retensi log Vercel yang cuma ~1 jam di plan Hobby.
--
-- Ditulis lewat service role (admin client) saja -> RLS aktif tanpa
-- policy (deny-all untuk anon/authenticated), sama seperti pola wa_log.
-- Jalankan di Supabase SQL Editor -> Run. Aman diulang (idempoten).
-- =====================================================================

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('server', 'client')),
  message text not null,
  stack text,
  digest text,
  url text,
  user_id uuid references public.profiles(id) on delete set null,
  user_agent text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx on public.error_logs (created_at desc);
create index if not exists error_logs_source_idx on public.error_logs (source);

alter table public.error_logs enable row level security;
