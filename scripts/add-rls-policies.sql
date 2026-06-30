-- =====================================================================
-- RLS SELECT policies untuk peserta / kelompok / kupon.
--
-- Konteks: ketiga tabel ini RLS-nya AKTIF tapi belum punya policy sama
-- sekali, sehingga aplikasi (baca pakai sesi user/anon key) mendapat 0
-- baris. Penulisan data tetap lewat service role di server action, jadi
-- yang dibutuhkan hanya policy SELECT.
--
-- Aturan: admin melihat semua; petugas hanya kelompoknya sendiri.
-- Jalankan di Supabase SQL Editor -> Run. Aman diulang (idempoten).
-- =====================================================================

-- Pastikan RLS aktif (harusnya sudah)
alter table public.peserta  enable row level security;
alter table public.kelompok enable row level security;
alter table public.kupon    enable row level security;

-- ---------- PESERTA ----------
drop policy if exists peserta_select on public.peserta;
create policy peserta_select on public.peserta
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.kelompok_id = peserta.kelompok_id)
    )
  );

-- ---------- KELOMPOK ----------
drop policy if exists kelompok_select on public.kelompok;
create policy kelompok_select on public.kelompok
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.kelompok_id = kelompok.id)
    )
  );

-- ---------- KUPON ----------
drop policy if exists kupon_select on public.kupon;
create policy kupon_select on public.kupon
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.kelompok_id = kupon.kelompok_id)
    )
  );
