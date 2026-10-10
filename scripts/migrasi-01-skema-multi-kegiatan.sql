-- =====================================================================
-- MIGRASI 01 — SKEMA MULTI-KEGIATAN
--
-- Tujuan: memisahkan yang selama ini menyatu di tabel `peserta`
--   identitas orang  -> public.anggota   (permanen, lintas kegiatan)
--   acara            -> public.kegiatan  (Ultah Kwan Kong, Baksos Imlek, ...)
--   setoran uang     -> public.donasi    (BOLEH banyak per orang per kegiatan)
--
-- SIFAT: hampir seluruhnya ADITIF. Tabel `peserta` TIDAK diubah dan TIDAK
-- dihapus — aplikasi lama tetap jalan normal sesudah skrip ini dijalankan.
-- Satu-satunya perubahan pada tabel lama ada di BAGIAN 7 (kolom & constraint
-- pada `kupon`) dan itu pun tidak menghapus data.
--
-- Idempoten: aman dijalankan ulang.
-- Migrasi ISI DATA ada di skrip terpisah (migrasi-02-*), bukan di sini.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BAGIAN 1 — KEGIATAN
-- ---------------------------------------------------------------------
create table if not exists public.kegiatan (
  id              uuid primary key default gen_random_uuid(),
  nama            text not null,
  tahun           int,
  tanggal_mulai   date,
  tanggal_selesai date,
  -- Kegiatan yang sedang berjalan. Form input donasi otomatis memakai ini.
  aktif           boolean not null default false,
  -- Nomor tanda terima berjalan sendiri per kegiatan (mulai 1 lagi tiap acara).
  tt_terakhir     bigint not null default 0,
  keterangan      text,
  created_at      timestamptz not null default now()
);

comment on table  public.kegiatan is 'Acara penggalangan dana (Ultah Kwan Kong 2026, Baksos Imlek 2027, dst). Semua donasi & kupon terikat ke salah satu kegiatan.';
comment on column public.kegiatan.aktif is 'Hanya SATU kegiatan boleh aktif. Form input donasi memakai kegiatan aktif ini.';
comment on column public.kegiatan.tt_terakhir is 'Counter nomor tanda terima per kegiatan — dinaikkan lewat fungsi assign_nomor_tt_donasi().';

-- Kunci "hanya satu kegiatan aktif" di level database, bukan cuma di aplikasi.
create unique index if not exists kegiatan_hanya_satu_aktif
  on public.kegiatan ((aktif)) where aktif;

-- ---------------------------------------------------------------------
-- BAGIAN 2 — ANGGOTA (master identitas, dipakai selamanya)
-- ---------------------------------------------------------------------
create table if not exists public.anggota (
  id              uuid primary key default gen_random_uuid(),
  nama            text not null,
  nama_hanzi      text,
  pinyin          text,
  alamat          text,
  no_whatsapp     text,
  kota_kabupaten  text,
  provinsi        text,
  jenis_usaha_id  uuid references public.jenis_usaha(id),
  keterangan      text,
  -- Buku penagihan SEKARANG. Berubah kalau anggota dipindah buku.
  -- Riwayat donasi TIDAK ikut pindah (lihat donasi.kelompok_id).
  buku_id         uuid references public.kelompok(id),
  aktif           boolean not null default true,
  -- Tanda "jangan kirim WA". Menempel di anggota, bukan di donasi, karena yang
  -- bermasalah adalah nomornya — berlaku untuk semua kegiatan sekaligus.
  wa_dikecualikan boolean not null default false,
  wa_alasan_kecuali text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

comment on table  public.anggota is 'Master identitas anggota — permanen dan dipakai lintas kegiatan. Menggantikan peran "identitas" yang dulu menempel di tabel peserta.';
comment on column public.anggota.buku_id is 'Buku penagihan saat ini. Diubah lewat fungsi pindah buku; perubahannya tercatat di anggota_buku_riwayat.';
comment on column public.anggota.aktif is 'false = anggota tidak ditagih lagi (pindah kota, meninggal, tutup usaha) tapi riwayatnya tetap tersimpan.';
comment on column public.anggota.wa_dikecualikan is 'true = jangan pernah kirimi WA. Nomor rusak atau anggota minta tidak dihubungi. Cron dan antre-ulang melewatinya.';

-- Pencarian nama oleh petugas saat menagih — dipakai sangat sering.
create index if not exists anggota_nama_idx on public.anggota using gin (to_tsvector('simple', nama));
create index if not exists anggota_buku_idx on public.anggota (buku_id) where aktif;
-- Nomor WA dinormalkan (hanya digit) supaya pencarian & deteksi dobel konsisten.
create index if not exists anggota_wa_idx
  on public.anggota ((regexp_replace(coalesce(no_whatsapp, ''), '\D', '', 'g')));

-- Nomor kontak usaha — pindah ikut anggota, bukan ikut transaksi.
create table if not exists public.anggota_nomor_usaha (
  id             uuid primary key default gen_random_uuid(),
  anggota_id     uuid not null references public.anggota(id) on delete cascade,
  label          text,
  nomor          text not null,
  sama_dengan_wa boolean not null default false,
  urutan         int not null default 0,
  created_at     timestamptz not null default now()
);

comment on table public.anggota_nomor_usaha is 'Nomor kontak usaha anggota (kantor, sales, owner). Ditampilkan publik di /cari-usaha, terpisah dari anggota.no_whatsapp (WA pribadi) demi privasi.';

create index if not exists anggota_nomor_usaha_anggota_idx on public.anggota_nomor_usaha (anggota_id);

-- ---------------------------------------------------------------------
-- BAGIAN 3 — DONASI (transaksi; boleh banyak per anggota per kegiatan)
-- ---------------------------------------------------------------------
create table if not exists public.donasi (
  id                  uuid primary key default gen_random_uuid(),
  anggota_id          uuid not null references public.anggota(id)  on delete restrict,
  kegiatan_id         uuid not null references public.kegiatan(id) on delete restrict,
  -- Buku PADA SAAT transaksi terjadi — sengaja disalin (snapshot), bukan
  -- diambil lewat join ke anggota.buku_id. Kalau anggota pindah buku nanti,
  -- rekap setoran petugas yang lama TIDAK ikut berubah.
  kelompok_id         uuid not null references public.kelompok(id),
  nominal             numeric(14,0) not null check (nominal > 0),
  metode_bayar        text not null check (metode_bayar in ('cash','transfer')),
  bukti_transfer_path text,
  tanggal             timestamptz not null default now(),
  nomor_tt            bigint,
  wa_status           text not null default 'pending'
                      check (wa_status in ('pending','sent','failed','not_sent')),
  wa_sent_at          timestamptz,
  wa_attempt_count    int not null default 0,
  keterangan          text,
  -- Jejak asal-usul migrasi. Diisi hanya untuk baris hasil migrasi-02,
  -- supaya bisa ditelusuri balik ke data lama kalau ada selisih.
  peserta_id_lama     uuid references public.peserta(id),
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id)
);

comment on table  public.donasi is 'Satu baris = satu kali setor uang. Satu anggota BOLEH punya beberapa baris di kegiatan yang sama (mis. nyumbang lagi beberapa hari kemudian).';
comment on column public.donasi.kelompok_id is 'Buku saat transaksi terjadi (snapshot). Tidak ikut berubah kalau anggota pindah buku, supaya laporan lama tetap cocok.';
comment on column public.donasi.nomor_tt is 'Nomor tanda terima, berjalan sendiri per kegiatan. Diisi lewat assign_nomor_tt_donasi().';

create index if not exists donasi_anggota_idx       on public.donasi (anggota_id, tanggal desc);
create index if not exists donasi_kegiatan_idx      on public.donasi (kegiatan_id);
create index if not exists donasi_kegiatan_kel_idx  on public.donasi (kegiatan_id, kelompok_id);
create index if not exists donasi_tanggal_idx       on public.donasi (tanggal desc);
create unique index if not exists donasi_tt_unik_per_kegiatan
  on public.donasi (kegiatan_id, nomor_tt) where nomor_tt is not null;
-- Cegah baris hasil migrasi terduplikasi kalau migrasi-02 dijalankan dua kali.
create unique index if not exists donasi_peserta_lama_unik
  on public.donasi (peserta_id_lama) where peserta_id_lama is not null;

-- ---------------------------------------------------------------------
-- BAGIAN 4 — RIWAYAT PINDAH BUKU
-- ---------------------------------------------------------------------
create table if not exists public.anggota_buku_riwayat (
  id            uuid primary key default gen_random_uuid(),
  anggota_id    uuid not null references public.anggota(id) on delete cascade,
  dari_buku_id  uuid references public.kelompok(id),
  ke_buku_id    uuid not null references public.kelompok(id),
  alasan        text,
  dipindah_oleh uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

comment on table public.anggota_buku_riwayat is 'Jejak perpindahan anggota antar buku — siapa memindah, kapan, dari buku mana ke buku mana. Mencegah saling tuduh antar petugas.';

create index if not exists anggota_buku_riwayat_anggota_idx
  on public.anggota_buku_riwayat (anggota_id, created_at desc);

-- ---------------------------------------------------------------------
-- BAGIAN 5 — RANGE KUPON PER KEGIATAN
--
-- `kelompok` tetap jadi master BUKU (Buku 1..6, petugasnya sama tiap tahun),
-- tapi range nomor kupon berbeda tiap kegiatan. Jadi range dipindah ke sini.
-- Kolom prefix/range_start/range_end di `kelompok` sengaja DIBIARKAN supaya
-- aplikasi lama tidak rusak; nanti dibersihkan setelah cutover.
-- ---------------------------------------------------------------------
create table if not exists public.kegiatan_kupon_range (
  id          uuid primary key default gen_random_uuid(),
  kegiatan_id uuid not null references public.kegiatan(id) on delete cascade,
  kelompok_id uuid not null references public.kelompok(id),
  prefix      text not null,
  range_start int  not null,
  range_end   int  not null,
  padding     int  not null default 4,
  created_at  timestamptz not null default now(),
  constraint kegiatan_kupon_range_urut check (range_end >= range_start),
  constraint kegiatan_kupon_range_unik unique (kegiatan_id, kelompok_id)
);

comment on table public.kegiatan_kupon_range is 'Range nomor kupon per buku untuk SATU kegiatan. Kegiatan berikutnya boleh memakai prefix yang sama (A0001 dst) tanpa bentrok.';

-- Prefix tidak boleh dobel di dalam satu kegiatan (antar kegiatan boleh sama).
create unique index if not exists kegiatan_kupon_range_prefix_unik
  on public.kegiatan_kupon_range (kegiatan_id, prefix);

-- ---------------------------------------------------------------------
-- BAGIAN 6 — NOMOR TANDA TERIMA PER KEGIATAN
--
-- Sequence lama `tanda_terima_seq` bersifat global, jadi kegiatan kedua akan
-- lanjut dari nomor terakhir kegiatan pertama. Diganti counter per kegiatan.
-- ---------------------------------------------------------------------
create or replace function public.assign_nomor_tt_donasi(p_donasi_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kegiatan uuid;
  v_nomor    bigint;
begin
  select nomor_tt, kegiatan_id into v_nomor, v_kegiatan
    from public.donasi where id = p_donasi_id;

  -- Sudah punya nomor (mis. kirim ulang WA) — kembalikan yang lama.
  if v_nomor is not null then
    return v_nomor;
  end if;
  if v_kegiatan is null then
    return null;
  end if;

  -- UPDATE ... RETURNING mengunci baris kegiatan, jadi dua petugas yang
  -- menyimpan bersamaan tidak bisa dapat nomor yang sama.
  update public.kegiatan
     set tt_terakhir = tt_terakhir + 1
   where id = v_kegiatan
   returning tt_terakhir into v_nomor;

  update public.donasi set nomor_tt = v_nomor where id = p_donasi_id;
  return v_nomor;
end $$;

comment on function public.assign_nomor_tt_donasi(uuid) is 'Ambil nomor tanda terima berikutnya untuk kegiatan si donasi. Atomic — aman dipanggil bersamaan oleh beberapa petugas.';

grant execute on function public.assign_nomor_tt_donasi(uuid) to service_role;

-- ---------------------------------------------------------------------
-- BAGIAN 7 — PENYESUAIAN TABEL `kupon`  (satu-satunya perubahan tabel lama)
--
-- Tidak ada data yang dihapus. Kolom baru boleh NULL dulu; diisi migrasi-02.
-- ---------------------------------------------------------------------
alter table public.kupon
  add column if not exists kegiatan_id uuid references public.kegiatan(id),
  add column if not exists donasi_id   uuid references public.donasi(id);

comment on column public.kupon.kegiatan_id is 'Kegiatan pemilik kupon ini. Nomor kupon hanya unik di dalam satu kegiatan.';
comment on column public.kupon.donasi_id   is 'Donasi yang membuat kupon ini diberikan. Menggantikan peran kupon.peserta_id.';

create index if not exists kupon_kegiatan_idx on public.kupon (kegiatan_id);
create index if not exists kupon_donasi_idx   on public.kupon (donasi_id);

-- Nomor kupon: dari unik-global jadi unik-per-kegiatan.
-- Dikerjakan di migrasi-02 SETELAH kegiatan_id terisi, supaya tidak ada
-- jendela waktu di mana nomor kupon tidak terlindungi dari duplikat.

-- ---------------------------------------------------------------------
-- BAGIAN 8 — RLS
--
-- Pola sama seperti tabel lama: admin lihat semua, petugas lihat bukunya
-- sendiri. Penulisan tetap lewat service role di server action.
-- ---------------------------------------------------------------------
alter table public.kegiatan             enable row level security;
alter table public.anggota              enable row level security;
alter table public.anggota_nomor_usaha  enable row level security;
alter table public.donasi               enable row level security;
alter table public.anggota_buku_riwayat enable row level security;
alter table public.kegiatan_kupon_range enable row level security;

-- Kegiatan = master data bersama, semua user login boleh baca.
drop policy if exists kegiatan_select on public.kegiatan;
create policy kegiatan_select on public.kegiatan
  for select to authenticated using (true);

drop policy if exists kegiatan_kupon_range_select on public.kegiatan_kupon_range;
create policy kegiatan_kupon_range_select on public.kegiatan_kupon_range
  for select to authenticated using (true);

-- Anggota: admin semua, petugas hanya buku sendiri.
-- Anggota tanpa buku (buku_id null) hanya terlihat oleh admin.
drop policy if exists anggota_select on public.anggota;
create policy anggota_select on public.anggota
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.kelompok_id = anggota.buku_id)
  ));

drop policy if exists anggota_nomor_usaha_select on public.anggota_nomor_usaha;
create policy anggota_nomor_usaha_select on public.anggota_nomor_usaha
  for select to authenticated
  using (exists (
    select 1 from public.anggota a
    join public.profiles p on p.id = auth.uid()
    where a.id = anggota_nomor_usaha.anggota_id
      and (p.role = 'admin' or p.kelompok_id = a.buku_id)
  ));

-- Donasi: pakai kelompok_id snapshot, BUKAN buku anggota saat ini. Petugas
-- tetap bisa melihat setoran yang dulu dia tagih walau anggotanya sudah pindah.
drop policy if exists donasi_select on public.donasi;
create policy donasi_select on public.donasi
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.kelompok_id = donasi.kelompok_id)
  ));

-- Riwayat pindah buku: admin saja (yang berhak memindahkan juga admin).
drop policy if exists anggota_buku_riwayat_select on public.anggota_buku_riwayat;
create policy anggota_buku_riwayat_select on public.anggota_buku_riwayat
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));
