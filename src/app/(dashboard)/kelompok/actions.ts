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
