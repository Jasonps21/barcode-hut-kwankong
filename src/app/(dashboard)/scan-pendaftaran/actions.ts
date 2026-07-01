"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBukti } from "@/lib/bukti";
import type { MetodeBayar } from "@/types/database";

export interface PesertaHit {
  id: string;
  nama: string;
  nama_hanzi: string | null;
  pinyin: string | null;
  alamat: string;
  no_whatsapp: string;
  nominal_donasi: number | string;
  metode_bayar: MetodeBayar | null;
  kelompok_id: string;
  kelompok_nama: string | null;
  kupon_count: number;
}

/**
 * Cari peserta hasil impor berdasarkan nama / alamat / no HP / nama hanzi / pinyin.
 * Memakai admin client lalu di-scope manual sesuai role (petugas hanya kelompoknya).
 */
export async function searchPesertaAction(query: string): Promise<PesertaHit[]> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const q = query.trim();
  if (q.length < 2) return [];

  const admin = createAdminClient();
  const like = `%${q}%`;

  let builder = admin
    .from("peserta")
    .select("id, nama, nama_hanzi, pinyin, alamat, no_whatsapp, nominal_donasi, metode_bayar, kelompok_id, kelompok(nama)")
    .or(
      [
        `nama.ilike.${like}`,
        `alamat.ilike.${like}`,
        `no_whatsapp.ilike.${like}`,
        `nama_hanzi.ilike.${like}`,
        `pinyin.ilike.${like}`,
      ].join(","),
    )
    .order("nama")
    .limit(25);

  if (profile.role !== "admin" && profile.kelompok_id) {
    builder = builder.eq("kelompok_id", profile.kelompok_id);
  }

  const { data, error } = await builder;
  if (error || !data) return [];

  const rows = data as unknown as Array<{
    id: string; nama: string; nama_hanzi: string | null; pinyin: string | null;
    alamat: string; no_whatsapp: string; nominal_donasi: number | string;
    metode_bayar: MetodeBayar | null; kelompok_id: string; kelompok: { nama: string } | null;
  }>;

  // Hitung jumlah kupon yang sudah ter-assign per peserta (untuk tanda "sudah daftar")
  const ids = rows.map((r) => r.id);
  const kuponCount = new Map<string, number>();
  if (ids.length) {
    const { data: kData } = await admin.from("kupon").select("peserta_id").in("peserta_id", ids);
    for (const k of (kData ?? []) as Array<{ peserta_id: string | null }>) {
      if (k.peserta_id) kuponCount.set(k.peserta_id, (kuponCount.get(k.peserta_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    nama: r.nama,
    nama_hanzi: r.nama_hanzi,
    pinyin: r.pinyin,
    alamat: r.alamat,
    no_whatsapp: r.no_whatsapp,
    nominal_donasi: r.nominal_donasi,
    metode_bayar: r.metode_bayar,
    kelompok_id: r.kelompok_id,
    kelompok_nama: r.kelompok?.nama ?? null,
    kupon_count: kuponCount.get(r.id) ?? 0,
  }));
}

export type RegisterState = { error?: string; success?: string } | undefined;

interface KuponRow { id: string; nomor_kupon: string; status: string; kelompok_id: string }

/**
 * Daftarkan peserta yang SUDAH ada (hasil impor): isi nominal + metode bayar,
 * lalu assign kupon yang di-scan ke peserta tersebut.
 */
export async function registerExistingPesertaAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);

  const pesertaId = String(formData.get("peserta_id") ?? "").trim();
  const no_whatsapp = String(formData.get("no_whatsapp") ?? "").trim();
  const nominalRaw = String(formData.get("nominal_donasi") ?? "").trim();
  const nominal_donasi = Number(nominalRaw.replace(/\D/g, ""));
  const metode_bayar = String(formData.get("metode_bayar") ?? "").trim() as MetodeBayar;
  const buktiFile = formData.get("bukti") as File | null;
  const tanpaKupon = formData.get("tanpa_kupon") != null;
  const kuponList = tanpaKupon
    ? []
    : formData.getAll("kupon").map((v) => String(v).trim()).filter(Boolean);

  if (!pesertaId) return { error: "Peserta belum dipilih." };
  if (!no_whatsapp) return { error: "Nomor WhatsApp wajib diisi." };
  if (!Number.isFinite(nominal_donasi) || nominal_donasi <= 0) return { error: "Nominal donasi tidak valid." };
  if (metode_bayar !== "cash" && metode_bayar !== "transfer") return { error: "Metode bayar wajib dipilih (cash/transfer)." };
  if (metode_bayar === "transfer" && !(buktiFile && buktiFile.size > 0)) {
    return { error: "Bukti transfer wajib diupload — foto belum diupload." };
  }
  if (!tanpaKupon) {
    if (kuponList.length === 0) return { error: "Minimal 1 kupon harus di-scan/input, atau centang \"Tidak mengambil kupon\"." };
    if (new Set(kuponList).size !== kuponList.length) return { error: "Ada nomor kupon duplikat." };
  }

  const admin = createAdminClient();

  const { data: pesertaData, error: pErr } = await admin
    .from("peserta")
    .select("id, nama, alamat, no_whatsapp, kelompok_id")
    .eq("id", pesertaId)
    .single();
  if (pErr || !pesertaData) return { error: "Peserta tidak ditemukan." };
  const peserta = pesertaData as { id: string; nama: string; alamat: string; no_whatsapp: string; kelompok_id: string };

  if (profile.role !== "admin" && peserta.kelompok_id !== profile.kelompok_id) {
    return { error: "Peserta bukan milik kelompok Anda." };
  }

  // ---- validasi kupon (dilewati bila peserta tidak mengambil kupon) ----
  let kupons: KuponRow[] = [];
  if (!tanpaKupon) {
    const { data: kuponData, error: kErr } = await admin
      .from("kupon")
      .select("id, nomor_kupon, status, kelompok_id")
      .in("nomor_kupon", kuponList);
    if (kErr) return { error: `Gagal cek kupon: ${kErr.message}` };

    kupons = (kuponData ?? []) as KuponRow[];
    const found = new Set(kupons.map((k) => k.nomor_kupon));
    const missing = kuponList.filter((k) => !found.has(k));
    if (missing.length) return { error: `Kupon tidak terdaftar: ${missing.join(", ")}.` };

    const distinctKelompok = [...new Set(kupons.map((k) => k.kelompok_id))];
    if (distinctKelompok.length > 1) {
      return { error: "Semua kupon harus dari kelompok yang sama." };
    }
    if (profile.role !== "admin" && distinctKelompok[0] !== profile.kelompok_id) {
      return { error: "Kupon bukan milik kelompok Anda." };
    }

    const taken = kupons.filter((k) => k.status !== "available");
    if (taken.length) {
      return { error: `Kupon sudah dipakai/ditukar: ${taken.map((k) => k.nomor_kupon).join(", ")}.` };
    }
  }

  // ---- upload bukti transfer (opsional) ----
  let bukti_transfer_path: string | null = null;
  try {
    bukti_transfer_path = await uploadBukti(admin, pesertaId, buktiFile);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal upload bukti." };
  }

  // ---- update peserta (nominal + metode bayar + status WA + bukti) ----
  const registeredAt = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    no_whatsapp, nominal_donasi, metode_bayar, wa_status: "pending",
    registered_at: registeredAt,
  };
  if (bukti_transfer_path) updatePayload.bukti_transfer_path = bukti_transfer_path;

  const { error: updErr } = await admin
    .from("peserta")
    .update(updatePayload)
    .eq("id", pesertaId);
  if (updErr) return { error: `Gagal simpan data peserta: ${updErr.message}` };

  // ---- assign kupon (dilewati bila tanpa kupon) ----
  if (kupons.length) {
    const { error: assignErr } = await admin
      .from("kupon")
      .update({
        status: "assigned",
        peserta_id: pesertaId,
        assigned_at: new Date().toISOString(),
        assigned_by: profile.id,
      })
      .in("id", kupons.map((k) => k.id));
    if (assignErr) return { error: `Gagal assign kupon: ${assignErr.message}` };
  }

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "register_peserta_impor",
    tabel_terkait: "peserta",
    record_id: pesertaId,
    detail: { nama: peserta.nama, kupons: kuponList, nominal_donasi, metode_bayar, tanpa_kupon: tanpaKupon },
  });

  // Assign nomor tanda terima sekarang (cepat). WA dikirim oleh cron
  // `/api/cron/send-wa` berdasarkan wa_status = "pending".
  await admin.rpc("assign_nomor_tt", { p_id: pesertaId });

  revalidatePath("/peserta");
  revalidatePath("/dashboard");
  return {
    success: tanpaKupon
      ? `Peserta "${peserta.nama}" terdaftar tanpa kupon, ${metode_bayar.toUpperCase()}. WA dikirim di latar belakang.`
      : `Peserta "${peserta.nama}" terdaftar: ${kuponList.length} kupon, ${metode_bayar.toUpperCase()}. WA dikirim di latar belakang.`,
  };
}
