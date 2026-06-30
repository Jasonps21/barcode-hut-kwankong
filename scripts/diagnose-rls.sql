-- Diagnostik RLS (read-only). Jalankan di Supabase SQL Editor, lihat hasilnya.

-- 1) Apakah RLS aktif di tabel-tabel utama?
select relname as tabel, relrowsecurity as rls_aktif, relforcerowsecurity as rls_forced
from pg_class
where relname in ('peserta','kelompok','kupon','profiles')
order by relname;

-- 2) Daftar policy yang ada beserta definisinya
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where tablename in ('peserta','kelompok','kupon','profiles')
order by tablename, cmd, policyname;
