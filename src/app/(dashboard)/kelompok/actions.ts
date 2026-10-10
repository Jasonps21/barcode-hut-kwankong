"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildNomorKupon, parseRangeFields, rangesOverlap } from "@/lib/range-parser";

/**
 * Kelompok = BUKU penagihan, dipakai lintas kegiatan. Rentang nomor kupon
 * berbeda tiap kegiatan, jadi rentang yang berlaku disimpan di
 * `kegiatan_kupon_range` untuk kegiatan yang sedang berjalan. Kolom
 * prefix/range di `kelompok` tetap diisi sebagai "rentang terakhir" — dipakai
 * sebagai nilai awal form dan menjaga kolom NOT NULL/UNIQUE lamanya.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

interface KegiatanKupon { id: string; nama: string }

/** Kegiatan berjalan yang memakai kupon, atau null bila kupon tidak dikelola saat ini. */
async function kegiatanKupon(admin: AdminClient): Promise<KegiatanKupon | null> {
  const { data } = await admin
    .from("kegiatan")
    .select("id, nama, pakai_kupon")
    .eq("aktif", true)
    .maybeSingle();
  const k = data as { id: string; nama: string; pakai_kupon: boolean } | null;
  return k && k.pakai_kupon ? { id: k.id, nama: k.nama } : null;
}

/** Cari rentang buku lain di kegiatan yang sama yang bertabrakan. */
async function cekTabrakan(
  admin: AdminClient,
  kegiatanId: string,
  kecualiKelompokId: string | null,
  parsed: { prefix: string; start: number; end: number },
): Promise<string | null> {
  let q = admin
    .from("kegiatan_kupon_range")
    .select("prefix, range_start, range_end, kelompok(nama)")
    .eq("kegiatan_id", kegiatanId);
  if (kecualiKelompokId) q = q.neq("kelompok_id", kecualiKelompokId);
  const { data, error } = await q;
  if (error) return `Gagal cek rentang: ${error.message}`;

  for (const r of (data ?? []) as unknown as Array<{
    prefix: string; range_start: number; range_end: number; kelompok: { nama: string } | null;
  }>) {
    if (rangesOverlap(parsed, { prefix: r.prefix, start: r.range_start, end: r.range_end })) {
      return `Range overlap dengan kelompok "${r.kelompok?.nama ?? "-"}" (${r.prefix}${r.range_start}-${r.prefix}${r.range_end}).`;
    }
  }
  return null;
}

export type CreateKelompokState = { error?: string; success?: string } | undefined;

export async function createKelompokAction(
  _prev: CreateKelompokState,
  formData: FormData,
): Promise<CreateKelompokState> {
  const profile = await requireProfile(["admin"]);
  const nama = String(formData.get("nama") ?? "").trim();
  const prefixInput = String(formData.get("prefix") ?? "");
  const startInput = String(formData.get("range_start") ?? "");
  const endInput = String(formData.get("range_end") ?? "");

  if (!nama) return { error: "Nama kelompok wajib diisi." };

  let parsed;
  try {
    parsed = parseRangeFields(prefixInput, startInput, endInput);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Format range tidak valid." };
  }

  const admin = createAdminClient();
  const kegiatan = await kegiatanKupon(admin);

  if (kegiatan) {
    const tabrakan = await cekTabrakan(admin, kegiatan.id, null, parsed);
    if (tabrakan) return { error: tabrakan };
  }

  const { data: kelompok, error: insertErr } = await admin
    .from("kelompok")
    .insert({
      nama,
      prefix: parsed.prefix,
      range_start: parsed.start,
      range_end: parsed.end,
      padding: parsed.padding,
    })
    .select("id")
    .single();
  if (insertErr || !kelompok) {
    const pesan = insertErr?.message.includes("kelompok_prefix_key")
      ? `Prefix "${parsed.prefix}" sudah dipakai kelompok lain.`
      : insertErr?.message ?? "unknown";
    return { error: `Gagal buat kelompok: ${pesan}` };
  }
  const kelompokId = (kelompok as { id: string }).id;

  if (!kegiatan) {
    revalidatePath("/kelompok");
    return {
      success: `Kelompok "${nama}" dibuat. Kupon belum digenerate karena tidak ada kegiatan berjalan yang memakai kupon.`,
    };
  }

  const { error: rErr } = await admin.from("kegiatan_kupon_range").insert({
    kegiatan_id: kegiatan.id,
    kelompok_id: kelompokId,
    prefix: parsed.prefix,
    range_start: parsed.start,
    range_end: parsed.end,
    padding: parsed.padding,
  });
  if (rErr) {
    await admin.from("kelompok").delete().eq("id", kelompokId);
    return { error: `Gagal simpan rentang kupon: ${rErr.message}` };
  }

  const rows: Array<{ nomor_kupon: string; kelompok_id: string; kegiatan_id: string; status: "available" }> = [];
  for (let n = parsed.start; n <= parsed.end; n++) {
    rows.push({
      nomor_kupon: buildNomorKupon(parsed.prefix, n, parsed.padding),
      kelompok_id: kelompokId,
      kegiatan_id: kegiatan.id,
      status: "available",
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: kErr } = await admin.from("kupon").insert(rows.slice(i, i + CHUNK));
    if (kErr) {
      await admin.from("kupon").delete().eq("kelompok_id", kelompokId);
      await admin.from("kegiatan_kupon_range").delete().eq("kelompok_id", kelompokId);
      await admin.from("kelompok").delete().eq("id", kelompokId);
      return { error: `Gagal generate kupon: ${kErr.message}` };
    }
  }

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "create_kelompok",
    tabel_terkait: "kelompok",
    record_id: kelompokId,
    detail: { nama, prefix: parsed.prefix, total: parsed.total, kegiatan: kegiatan.nama },
  });

  revalidatePath("/kelompok");
  return { success: `Kelompok "${nama}" dibuat dengan ${parsed.total} kupon untuk ${kegiatan.nama}.` };
}

export type UpdateKelompokState = { error?: string; success?: string } | undefined;

export async function updateKelompokAction(
  _prev: UpdateKelompokState,
  formData: FormData,
): Promise<UpdateKelompokState> {
  await requireProfile(["admin"]);
  const id = String(formData.get("kelompok_id") ?? "").trim();
  const nama = String(formData.get("nama") ?? "").trim();
  const prefixInput = String(formData.get("prefix") ?? "");
  const startInput = String(formData.get("range_start") ?? "");
  const endInput = String(formData.get("range_end") ?? "");

  if (!id) return { error: "Kelompok tidak valid." };
  if (!nama) return { error: "Nama kelompok wajib diisi." };

  let parsed;
  try {
    parsed = parseRangeFields(prefixInput, startInput, endInput);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Format range tidak valid." };
  }

  const admin = createAdminClient();

  const { data: current } = await admin.from("kelompok").select("id").eq("id", id).single();
  if (!current) return { error: "Kelompok tidak ditemukan." };

  const kegiatan = await kegiatanKupon(admin);

  // Tanpa kegiatan berkupon, yang bisa diubah hanya nama & rentang terakhir.
  if (!kegiatan) {
    const { error } = await admin
      .from("kelompok")
      .update({ nama, prefix: parsed.prefix, range_start: parsed.start, range_end: parsed.end, padding: parsed.padding })
      .eq("id", id);
    if (error) return { error: `Gagal simpan kelompok: ${error.message}` };
    revalidatePath("/kelompok");
    return { success: `Kelompok "${nama}" diperbarui. Kupon tidak diubah karena tidak ada kegiatan berjalan yang memakai kupon.` };
  }

  const tabrakan = await cekTabrakan(admin, kegiatan.id, id, parsed);
  if (tabrakan) return { error: tabrakan };

  // Set nomor kupon yang diinginkan dari range baru.
  const desired = new Set<string>();
  for (let n = parsed.start; n <= parsed.end; n++) desired.add(buildNomorKupon(parsed.prefix, n, parsed.padding));

  // Kupon kelompok ini DI KEGIATAN BERJALAN saja — kupon kegiatan lama tidak disentuh.
  const { data: existingKupon, error: exErr } = await admin
    .from("kupon")
    .select("nomor_kupon, status")
    .eq("kelompok_id", id)
    .eq("kegiatan_id", kegiatan.id);
  if (exErr) return { error: `Gagal baca kupon: ${exErr.message}` };
  const existing = (existingKupon ?? []) as Array<{ nomor_kupon: string; status: string }>;
  const existingNomor = new Set(existing.map((k) => k.nomor_kupon));

  // Kupon di luar range baru -> harus dihapus. Tolak bila ada yg sudah dipakai/ditukar.
  const toRemove = existing.filter((k) => !desired.has(k.nomor_kupon));
  const used = toRemove.filter((k) => k.status !== "available");
  if (used.length) {
    const contoh = used.slice(0, 5).map((k) => k.nomor_kupon).join(", ");
    return {
      error: `Tidak bisa ubah range: ${used.length} kupon di luar range baru sudah dipakai/ditukar (${contoh}${used.length > 5 ? ", …" : ""}). Lepaskan kupon tersebut dari setorannya lebih dulu.`,
    };
  }

  const toAdd = [...desired].filter((n) => !existingNomor.has(n));
  const removeNomor = toRemove.map((k) => k.nomor_kupon);

  const { error: updErr } = await admin
    .from("kelompok")
    .update({ nama, prefix: parsed.prefix, range_start: parsed.start, range_end: parsed.end, padding: parsed.padding })
    .eq("id", id);
  if (updErr) {
    const pesan = updErr.message.includes("kelompok_prefix_key")
      ? `Prefix "${parsed.prefix}" sudah dipakai kelompok lain.`
      : updErr.message;
    return { error: `Gagal simpan kelompok: ${pesan}` };
  }

  const { error: rErr } = await admin.from("kegiatan_kupon_range").upsert(
    {
      kegiatan_id: kegiatan.id,
      kelompok_id: id,
      prefix: parsed.prefix,
      range_start: parsed.start,
      range_end: parsed.end,
      padding: parsed.padding,
    },
    { onConflict: "kegiatan_id,kelompok_id" },
  );
  if (rErr) return { error: `Gagal simpan rentang kupon: ${rErr.message}` };

  const CHUNK = 500;
  for (let i = 0; i < removeNomor.length; i += CHUNK) {
    const slice = removeNomor.slice(i, i + CHUNK);
    const { error } = await admin
      .from("kupon")
      .delete()
      .eq("kelompok_id", id)
      .eq("kegiatan_id", kegiatan.id)
      .eq("status", "available")
      .in("nomor_kupon", slice);
    if (error) return { error: `Gagal hapus kupon lama: ${error.message}` };
  }

  const addRows = toAdd.map((nomor_kupon) => ({
    nomor_kupon,
    kelompok_id: id,
    kegiatan_id: kegiatan.id,
    status: "available" as const,
  }));
  for (let i = 0; i < addRows.length; i += CHUNK) {
    const { error } = await admin.from("kupon").insert(addRows.slice(i, i + CHUNK));
    if (error) return { error: `Gagal tambah kupon baru: ${error.message}` };
  }

  revalidatePath("/kelompok");
  revalidatePath("/kupon");
  revalidatePath("/laporan");
  return {
    success: `Kelompok "${nama}" diperbarui. Total kupon ${kegiatan.nama}: ${parsed.total}` +
      (toAdd.length || removeNomor.length ? ` (+${toAdd.length} baru, -${removeNomor.length} dihapus).` : "."),
  };
}

function backWith(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/kelompok?${qs}`);
}

export async function deleteKelompokAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const id = String(formData.get("kelompok_id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();

  // Jangan hapus kalau buku ini punya riwayat apa pun: anggota, setoran, data
  // lama, riwayat pindah buku, atau kupon yang dipakai/ditukar. Kupon
  // "available" yang belum terpakai boleh ikut terhapus.
  const [
    { count: anggotaCount }, { count: donasiCount }, { count: pesertaCount },
    { count: riwayatCount }, { count: usedKuponCount }, { data: petugas },
  ] = await Promise.all([
    admin.from("anggota").select("id", { count: "exact", head: true }).eq("buku_id", id),
    admin.from("donasi").select("id", { count: "exact", head: true }).eq("kelompok_id", id),
    admin.from("peserta").select("id", { count: "exact", head: true }).eq("kelompok_id", id),
    admin.from("anggota_buku_riwayat").select("id", { count: "exact", head: true }).or(`dari_buku_id.eq.${id},ke_buku_id.eq.${id}`),
    admin.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", id).neq("status", "available"),
    admin.from("profiles").select("nama").eq("kelompok_id", id),
  ]);
  if ((anggotaCount ?? 0) + (donasiCount ?? 0) + (pesertaCount ?? 0) + (riwayatCount ?? 0) + (usedKuponCount ?? 0) > 0) {
    backWith({ error: "Kelompok tidak bisa dihapus karena sudah punya anggota, setoran, atau kupon yang dipakai/ditukar." });
  }

  // Petugas yang masih di-assign ke kelompok ini akan memblokir penghapusan (FK).
  const petugasList = (petugas ?? []) as Array<{ nama: string }>;
  if (petugasList.length > 0) {
    const nama = petugasList.map((p) => p.nama).join(", ");
    backWith({
      error: `Kelompok masih dipakai oleh petugas: ${nama}. Pindahkan/ubah kelompok petugas tersebut di menu Pengguna lebih dulu.`,
    });
  }

  // Hapus kupon master yang belum terpakai & rentangnya lebih dulu (hindari kendala FK).
  const { error: kErr } = await admin.from("kupon").delete().eq("kelompok_id", id).eq("status", "available");
  if (kErr) backWith({ error: `Gagal hapus kupon kelompok: ${kErr.message}` });

  const { error: rErr } = await admin.from("kegiatan_kupon_range").delete().eq("kelompok_id", id);
  if (rErr) backWith({ error: `Gagal hapus rentang kupon: ${rErr.message}` });

  const { error: dErr } = await admin.from("kelompok").delete().eq("id", id);
  if (dErr) backWith({ error: `Gagal hapus kelompok: ${dErr.message}` });

  revalidatePath("/kelompok");
  revalidatePath("/laporan");
  backWith({ deleted: "1" });
}
