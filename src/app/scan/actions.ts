"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LookupResult {
  status:
    | "ok"
    | "wrong_group"
    | "already_redeemed"
    | "not_assigned"
    | "not_found";
  nomor_kupon: string;
  kupon_id?: string;
  kelompok_nama?: string;
  peserta?: { id: string; nama: string; alamat: string; no_whatsapp: string };
  redeemed_at?: string;
}

export async function lookupKupon(nomorKupon: string): Promise<LookupResult> {
  const v = nomorKupon.trim().toUpperCase();
  if (!v) return { status: "not_found", nomor_kupon: v };

  const admin = createAdminClient();
  const { data } = await admin
    .from("kupon")
    .select("id, status, kelompok_id, redeemed_at, kelompok(nama), peserta(id, nama, alamat, no_whatsapp)")
    .eq("nomor_kupon", v)
    .maybeSingle();

  if (!data) return { status: "not_found", nomor_kupon: v };
  const k = data as unknown as {
    id: string;
    status: string;
    kelompok_id: string;
    redeemed_at: string | null;
    kelompok: { nama: string } | null;
    peserta: { id: string; nama: string; alamat: string; no_whatsapp: string } | null;
  };

  if (k.status === "redeemed") {
    return {
      status: "already_redeemed", nomor_kupon: v, kupon_id: k.id,
      kelompok_nama: k.kelompok?.nama, peserta: k.peserta ?? undefined,
      redeemed_at: k.redeemed_at ?? undefined,
    };
  }
  if (k.status === "available" || !k.peserta) {
    return { status: "not_assigned", nomor_kupon: v, kupon_id: k.id, kelompok_nama: k.kelompok?.nama };
  }
  return {
    status: "ok", nomor_kupon: v, kupon_id: k.id,
    kelompok_nama: k.kelompok?.nama, peserta: k.peserta,
  };
}

export async function redeemKupon(kuponId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("kupon")
    .select("status")
    .eq("id", kuponId)
    .single();
  if (!existing) return { ok: false, error: "Kupon tidak ditemukan." };
  const e = existing as { status: string };

  if (e.status === "redeemed") return { ok: false, error: "Kupon sudah ditukar." };
  if (e.status !== "assigned") return { ok: false, error: "Kupon belum diasosiasikan ke peserta." };

  const { error } = await admin
    .from("kupon")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", kuponId)
    .eq("status", "assigned");
  if (error) return { ok: false, error: error.message };

  await admin.from("log_aktivitas").insert({
    aksi: "redeem_kupon",
    tabel_terkait: "kupon",
    record_id: kuponId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/scan");
  return { ok: true };
}
