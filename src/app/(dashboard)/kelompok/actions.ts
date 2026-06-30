"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildNomorKupon, parseRangeFields, rangesOverlap } from "@/lib/range-parser";

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

  const { data: existing, error: existErr } = await admin
    .from("kelompok")
    .select("nama, prefix, range_start, range_end");
  if (existErr) return { error: `Gagal cek kelompok: ${existErr.message}` };

  for (const k of (existing ?? []) as Array<{
    nama: string; prefix: string; range_start: number; range_end: number;
  }>) {
    if (
      rangesOverlap(
        { prefix: parsed.prefix, start: parsed.start, end: parsed.end },
        { prefix: k.prefix, start: k.range_start, end: k.range_end },
      )
    ) {
      return { error: `Range overlap dengan kelompok "${k.nama}" (${k.prefix}${k.range_start}-${k.prefix}${k.range_end}).` };
    }
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
  if (insertErr || !kelompok) return { error: `Gagal buat kelompok: ${insertErr?.message ?? "unknown"}` };

  const rows: Array<{ nomor_kupon: string; kelompok_id: string; status: "available" }> = [];
  for (let n = parsed.start; n <= parsed.end; n++) {
    rows.push({
      nomor_kupon: buildNomorKupon(parsed.prefix, n, parsed.padding),
      kelompok_id: (kelompok as { id: string }).id,
      status: "available",
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: kErr } = await admin.from("kupon").insert(rows.slice(i, i + CHUNK));
    if (kErr) {
      await admin.from("kelompok").delete().eq("id", (kelompok as { id: string }).id);
      return { error: `Gagal generate kupon: ${kErr.message}` };
    }
  }

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "create_kelompok",
    tabel_terkait: "kelompok",
    record_id: (kelompok as { id: string }).id,
    detail: { nama, prefix: parsed.prefix, total: parsed.total },
  });

  revalidatePath("/kelompok");
  return { success: `Kelompok "${nama}" dibuat dengan ${parsed.total} kupon.` };
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

  // Overlap dengan kelompok LAIN (selain dirinya sendiri).
  const { data: others, error: othersErr } = await admin
    .from("kelompok")
    .select("nama, prefix, range_start, range_end")
    .neq("id", id);
  if (othersErr) return { error: `Gagal cek kelompok: ${othersErr.message}` };
  for (const k of (others ?? []) as Array<{ nama: string; prefix: string; range_start: number; range_end: number }>) {
    if (rangesOverlap({ prefix: parsed.prefix, start: parsed.start, end: parsed.end }, { prefix: k.prefix, start: k.range_start, end: k.range_end })) {
      return { error: `Range overlap dengan kelompok "${k.nama}" (${k.prefix}${k.range_start}-${k.prefix}${k.range_end}).` };
    }
  }

  // Set nomor kupon yang diinginkan dari range baru.
  const desired = new Set<string>();
  for (let n = parsed.start; n <= parsed.end; n++) desired.add(buildNomorKupon(parsed.prefix, n, parsed.padding));

  // Kupon yang sudah ada di kelompok ini.
  const { data: existingKupon, error: exErr } = await admin
    .from("kupon")
    .select("nomor_kupon, status")
    .eq("kelompok_id", id);
  if (exErr) return { error: `Gagal baca kupon: ${exErr.message}` };
  const existing = (existingKupon ?? []) as Array<{ nomor_kupon: string; status: string }>;
  const existingNomor = new Set(existing.map((k) => k.nomor_kupon));

  // Kupon di luar range baru -> harus dihapus. Tolak bila ada yg sudah dipakai/ditukar.
  const toRemove = existing.filter((k) => !desired.has(k.nomor_kupon));
  const used = toRemove.filter((k) => k.status !== "available");
  if (used.length) {
    const contoh = used.slice(0, 5).map((k) => k.nomor_kupon).join(", ");
    return {
      error: `Tidak bisa ubah range: ${used.length} kupon di luar range baru sudah dipakai/ditukar (${contoh}${used.length > 5 ? ", …" : ""}). Lepaskan kupon tersebut dari peserta lebih dulu.`,
    };
  }

  const toAdd = [...desired].filter((n) => !existingNomor.has(n));
  const removeNomor = toRemove.map((k) => k.nomor_kupon);

  // Terapkan perubahan kelompok.
  const { error: updErr } = await admin
    .from("kelompok")
    .update({ nama, prefix: parsed.prefix, range_start: parsed.start, range_end: parsed.end, padding: parsed.padding })
    .eq("id", id);
  if (updErr) return { error: `Gagal simpan kelompok: ${updErr.message}` };

  // Hapus kupon available yang sudah di luar range.
  const CHUNK = 500;
  for (let i = 0; i < removeNomor.length; i += CHUNK) {
    const slice = removeNomor.slice(i, i + CHUNK);
    const { error } = await admin.from("kupon").delete().eq("kelompok_id", id).in("nomor_kupon", slice);
    if (error) return { error: `Gagal hapus kupon lama: ${error.message}` };
  }

  // Tambah kupon baru.
  const addRows = toAdd.map((nomor_kupon) => ({ nomor_kupon, kelompok_id: id, status: "available" as const }));
  for (let i = 0; i < addRows.length; i += CHUNK) {
    const { error } = await admin.from("kupon").insert(addRows.slice(i, i + CHUNK));
    if (error) return { error: `Gagal tambah kupon baru: ${error.message}` };
  }

  revalidatePath("/kelompok");
  revalidatePath("/peserta");
  revalidatePath("/laporan");
  return {
    success: `Kelompok "${nama}" diperbarui. Total kupon ${parsed.total}` +
      (toAdd.length || removeNomor.length ? ` (+${toAdd.length} baru, -${removeNomor.length} dihapus).` : "."),
  };
}

export async function deleteKelompokAction(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const id = String(formData.get("kelompok_id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();

  // Jangan hapus kalau masih ada peserta atau kupon di kelompok ini.
  const [{ count: pesertaCount }, { count: kuponCount }] = await Promise.all([
    admin.from("peserta").select("id", { count: "exact", head: true }).eq("kelompok_id", id),
    admin.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", id),
  ]);
  if ((pesertaCount ?? 0) > 0 || (kuponCount ?? 0) > 0) return; // diblok di UI dgn pesan

  await admin.from("kelompok").delete().eq("id", id);
  revalidatePath("/kelompok");
}
