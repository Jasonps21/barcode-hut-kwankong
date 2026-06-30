-- RBAC granular: izin per-user untuk edit & hapus peserta.
-- Admin selalu punya akses penuh (di-handle di aplikasi); kolom ini hanya
-- relevan untuk petugas. Default: tidak boleh edit & tidak boleh hapus.
alter table public.profiles
  add column if not exists can_edit_peserta   boolean not null default false,
  add column if not exists can_delete_peserta boolean not null default false;
