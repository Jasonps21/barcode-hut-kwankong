-- Migrasi 03: tanda "jangan kirim WA" pada peserta.
--
-- Latar: nomor rusak (kosong, "0", dua nomor tercampur) selalu berakhir
-- `wa_status = 'failed'`, dan tombol "Antre ulang" di /wa-log menyasar persis
-- status itu. Akibatnya baris yang mustahil terkirim ikut terangkut setiap
-- kali, gagal lagi, dan menumpuk di wa_log tanpa ujung.
--
-- Kolom ini memisahkan "gagal, layak dicoba lagi" dari "jangan pernah kirim".
-- Sengaja TIDAK memakai wa_status = 'not_sent', karena nilai itu juga berarti
-- "belum waktunya dikirim" untuk pendaftaran baru — dua arti dalam satu kolom
-- membuat filternya tidak bisa dipercaya.

alter table public.peserta
  add column if not exists wa_dikecualikan boolean not null default false,
  add column if not exists wa_alasan_kecuali text;

comment on column public.peserta.wa_dikecualikan is
  'True = peserta ini tidak boleh dikirimi WA. Cron dan tombol Antre ulang melewatinya. Diisi otomatis saat nomornya tidak lolos validasi, atau manual oleh admin.';
comment on column public.peserta.wa_alasan_kecuali is
  'Alasan pengecualian, ditampilkan di halaman Log WhatsApp. Diawali "Otomatis:" bila disetel sistem.';

-- Antrean cron menyaring tiga kolom ini sekaligus; indeks parsial menjaga
-- query tetap murah setelah tabel tumbuh.
create index if not exists idx_peserta_antre_wa
  on public.peserta (wa_status, wa_dikecualikan, registered_at)
  where registered_at is not null;
