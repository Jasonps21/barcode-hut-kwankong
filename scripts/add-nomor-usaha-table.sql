-- Tambah tabel nomor kontak usaha peserta (bisa lebih dari 1: kantor, sales, owner, dst).
-- Dipisah dari peserta.no_whatsapp (nomor WA pribadi) supaya yang tampil publik di
-- /cari-usaha bukan nomor pribadi, kecuali memang sengaja ditandai sama.
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.peserta_nomor_usaha (
  id uuid primary key default gen_random_uuid(),
  peserta_id uuid not null references public.peserta(id) on delete cascade,
  label text,
  nomor text not null,
  sama_dengan_wa boolean not null default false,
  urutan int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.peserta_nomor_usaha is 'Nomor kontak usaha peserta (bisa lebih dari 1: kantor, sales, owner). Ditampilkan publik di /cari-usaha, terpisah dari peserta.no_whatsapp (nomor WA pribadi) demi privasi.';
comment on column public.peserta_nomor_usaha.label is 'Label bebas, mis. "Kantor", "Sales", "Owner"';
comment on column public.peserta_nomor_usaha.nomor is 'Nomor telp/WA usaha. Bila sama_dengan_wa true, nilai ini di-sync ulang dari peserta.no_whatsapp tiap kali data peserta disimpan.';
comment on column public.peserta_nomor_usaha.sama_dengan_wa is 'True bila nomor ini sengaja disamakan dengan no_whatsapp pribadi peserta.';

create index if not exists peserta_nomor_usaha_peserta_id_idx on public.peserta_nomor_usaha(peserta_id);

alter table public.peserta_nomor_usaha enable row level security;

-- Baca: sama seperti akses peserta (admin lihat semua, petugas hanya kelompoknya).
drop policy if exists peserta_nomor_usaha_select on public.peserta_nomor_usaha;
create policy peserta_nomor_usaha_select on public.peserta_nomor_usaha
  for select to authenticated
  using (
    exists (
      select 1 from public.peserta pe
      join public.profiles p on p.id = auth.uid()
      where pe.id = peserta_nomor_usaha.peserta_id
        and (p.role = 'admin' or p.kelompok_id = pe.kelompok_id)
    )
  );

-- Insert/update/delete dilakukan lewat server action pakai service role (admin client),
-- yang sudah mengecek permission (canEditPeserta) & kelompok di app layer — sama seperti
-- pola tabel peserta itu sendiri. Tidak perlu policy write untuk role authenticated.
