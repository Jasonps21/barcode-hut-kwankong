"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPesertaWa } from "@/lib/fonnte";

export type CreatePesertaState = {
  error?: string;
  success?: string;
} | undefined;

interface KuponRow { id: string; nomor_kupon: string; status: string; kelompok_id: string }

export async function createPesertaAction(
  _prev: CreatePesertaState,
  formData: FormData,
): Promise<CreatePesertaState> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);

  const nama = String(formData.get("nama") ?? "").trim();
  const alamat = String(formData.get("alamat") ?? "").trim();
  const no_whatsapp = String(formData.get("no_whatsapp") ?? "").trim();
  const nominalRaw = String(formData.get("nominal_donasi") ?? "").trim();
  const nominal_donasi = Number(nominalRaw.replace(/[^0-9.]/g, ""));
  const kuponList = formData.getAll("kupon").map((v) => String(v).trim()).filter(Boolean);

  if (!nama) return { error: "Nama wajib diisi." };
  if (!alamat) return { error: "Alamat wajib diisi." };
  if (!no_whatsapp) return { error: "Nomor WhatsApp wajib diisi." };
  if (!Number.isFinite(nominal_donasi) || nominal_donasi <= 0) return { error: "Nominal donasi tidak valid." };
  if (kuponList.length === 0) return { error: "Minimal 1 kupon harus di-scan/input." };
  if (new Set(kuponList).size !== kuponList.length) return { error: "Ada nomor kupon duplikat." };

  const admin = createAdminClient();

  const { data: kuponData, error: kErr } = await admin
    .from("kupon")
    .select("id, nomor_kupon, status, kelompok_id")
    .in("nomor_kupon", kuponList);
  if (kErr) return { error: `Gagal cek kupon: ${kErr.message}` };

  const kupons = (kuponData ?? []) as KuponRow[];
  const found = new Set(kupons.map((k) => k.nomor_kupon));
  const missing = kuponList.filter((k) => !found.has(k));
  if (missing.length) return { error: `Kupon tidak terdaftar: ${missing.join(", ")}.` };

  const distinctKelompok = [...new Set(kupons.map((k) => k.kelompok_id))];
  if (distinctKelompok.length > 1) {
    return { error: "Kupon yang dipilih berasal dari kelompok berbeda. Semua kupon harus dari kelompok yang sama." };
  }
  const kelompokId = distinctKelompok[0];

  if (profile.role !== "admin" && kelompokId !== profile.kelompok_id) {
    return { error: "Kupon bukan milik kelompok Anda." };
  }

  const taken = kupons.filter((k) => k.status !== "available");
  if (taken.length) {
    return { error: `Kupon sudah dipakai/ditukar: ${taken.map((k) => k.nomor_kupon).join(", ")}.` };
  }

  const { data: pesertaData, error: pErr } = await admin
    .from("peserta")
    .insert({
      nama, alamat, no_whatsapp, nominal_donasi,
      kelompok_id: kelompokId,
      wa_status: "pending",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (pErr || !pesertaData) return { error: `Gagal simpan peserta: ${pErr?.message ?? "unknown"}` };

  const pesertaId = (pesertaData as { id: string }).id;

  const { error: assignErr } = await admin
    .from("kupon")
    .update({
      status: "assigned",
      peserta_id: pesertaId,
      assigned_at: new Date().toISOString(),
      assigned_by: profile.id,
    })
    .in("id", kupons.map((k) => k.id));

  if (assignErr) {
    await admin.from("peserta").delete().eq("id", pesertaId);
    return { error: `Gagal assign kupon: ${assignErr.message}` };
  }

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "create_peserta",
    tabel_terkait: "peserta",
    record_id: pesertaId,
    detail: { nama, kupons: kuponList, nominal_donasi },
  });

  const sortedKupons = [...kuponList].sort();
  after(async () => {
    await sendPesertaWa({
      pesertaId,
      noWhatsapp: no_whatsapp,
      template: { nama, alamat, nominal_donasi, nomor_kupon_list: sortedKupons },
    });
  });

  revalidatePath("/peserta");
  revalidatePath("/dashboard");
  return { success: `Peserta "${nama}" tersimpan dengan ${kuponList.length} kupon. WA dikirim di latar belakang.` };
}

export async function resendWaAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const pesertaId = String(formData.get("peserta_id") ?? "");
  if (!pesertaId) return;

  const admin = createAdminClient();
  const { data: peserta } = await admin
    .from("peserta")
    .select("id, nama, alamat, no_whatsapp, nominal_donasi, kelompok_id")
    .eq("id", pesertaId)
    .single();
  if (!peserta) return;
  const p = peserta as { id: string; nama: string; alamat: string; no_whatsapp: string; nominal_donasi: number | string; kelompok_id: string };

  if (profile.role !== "admin" && p.kelompok_id !== profile.kelompok_id) return;

  const { data: kupons } = await admin
    .from("kupon")
    .select("nomor_kupon")
    .eq("peserta_id", pesertaId)
    .order("nomor_kupon");

  const list = ((kupons ?? []) as { nomor_kupon: string }[]).map((k) => k.nomor_kupon);

  await admin.from("peserta").update({ wa_status: "pending" }).eq("id", pesertaId);

  after(async () => {
    await sendPesertaWa({
      pesertaId,
      noWhatsapp: p.no_whatsapp,
      template: { nama: p.nama, alamat: p.alamat, nominal_donasi: p.nominal_donasi, nomor_kupon_list: list },
    });
  });

  revalidatePath("/peserta");
}
