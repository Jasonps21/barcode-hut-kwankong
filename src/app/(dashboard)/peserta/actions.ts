"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireProfile, canEditPeserta, canDeletePeserta } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPesertaWa } from "@/lib/fonnte";
import { hanziToPinyin } from "@/lib/pinyin";
import { uploadBukti } from "@/lib/bukti";
import { formatNomorTT, formatTanggalIndo } from "@/lib/wa-template";

/** Assign nomor tanda terima sekuensial (atomic via RPC). Return nomor mentah. */
async function assignNomorTT(admin: ReturnType<typeof createAdminClient>, pesertaId: string): Promise<number | null> {
  const { data } = await admin.rpc("assign_nomor_tt", { p_id: pesertaId });
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
  const nama_hanzi = String(formData.get("nama_hanzi") ?? "").trim();
  // Pinyin selalu dihitung ulang di server dari Hanzi agar konsisten (tidak
  // bergantung pada nilai dari client).
  const pinyin = nama_hanzi ? hanziToPinyin(nama_hanzi) : "";
  const alamat = String(formData.get("alamat") ?? "").trim();
  const no_whatsapp = String(formData.get("no_whatsapp") ?? "").trim();
  const nominalRaw = String(formData.get("nominal_donasi") ?? "").trim();
  const nominal_donasi = Number(nominalRaw.replace(/\D/g, ""));
  const metode_bayar = String(formData.get("metode_bayar") ?? "").trim();
  const buktiFile = formData.get("bukti") as File | null;
  const tanpaKupon = formData.get("tanpa_kupon") != null;
  const kelompokManual = String(formData.get("kelompok_id") ?? "").trim();
  const kuponList = tanpaKupon
    ? []
    : formData.getAll("kupon").map((v) => String(v).trim()).filter(Boolean);

  if (!nama) return { error: "Nama wajib diisi." };
  if (!alamat) return { error: "Alamat wajib diisi." };
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
  const registeredAt = new Date().toISOString();

  let kelompokId: string;
  let kupons: KuponRow[] = [];

  if (tanpaKupon) {
    // Tanpa kupon: kelompok tidak bisa ditentukan dari kupon.
    if (profile.role === "admin") {
      if (!kelompokManual) return { error: "Kelompok wajib dipilih saat tidak mengambil kupon." };
      const { data: kel } = await admin.from("kelompok").select("id").eq("id", kelompokManual).single();
      if (!kel) return { error: "Kelompok tidak ditemukan." };
      kelompokId = kelompokManual;
    } else {
      if (!profile.kelompok_id) return { error: "Akun Anda belum terhubung ke kelompok." };
      kelompokId = profile.kelompok_id;
    }
  } else {
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
      return { error: "Kupon yang dipilih berasal dari kelompok berbeda. Semua kupon harus dari kelompok yang sama." };
    }
    kelompokId = distinctKelompok[0];

    if (profile.role !== "admin" && kelompokId !== profile.kelompok_id) {
      return { error: "Kupon bukan milik kelompok Anda." };
    }

    const taken = kupons.filter((k) => k.status !== "available");
    if (taken.length) {
      return { error: `Kupon sudah dipakai/ditukar: ${taken.map((k) => k.nomor_kupon).join(", ")}.` };
    }
  }

  const { data: pesertaData, error: pErr } = await admin
    .from("peserta")
    .insert({
      nama,
      nama_hanzi: nama_hanzi || null,
      pinyin: pinyin || null,
      alamat, no_whatsapp, nominal_donasi,
      metode_bayar,
      registered_at: registeredAt,
      kelompok_id: kelompokId,
      wa_status: "pending",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (pErr || !pesertaData) return { error: `Gagal simpan peserta: ${pErr?.message ?? "unknown"}` };

  const pesertaId = (pesertaData as { id: string }).id;

  // Upload bukti transfer (opsional). Kalau gagal, batalkan peserta.
  if (buktiFile && buktiFile.size > 0) {
    try {
      const path = await uploadBukti(admin, pesertaId, buktiFile);
      if (path) await admin.from("peserta").update({ bukti_transfer_path: path }).eq("id", pesertaId);
    } catch (e) {
      await admin.from("peserta").delete().eq("id", pesertaId);
      return { error: e instanceof Error ? e.message : "Gagal upload bukti." };
    }
  }

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

    if (assignErr) {
      await admin.from("peserta").delete().eq("id", pesertaId);
      return { error: `Gagal assign kupon: ${assignErr.message}` };
    }
  }

  await admin.from("log_aktivitas").insert({
    user_id: profile.id,
    aksi: "create_peserta",
    tabel_terkait: "peserta",
    record_id: pesertaId,
    detail: { nama, kupons: kuponList, nominal_donasi, tanpa_kupon: tanpaKupon },
  });

  // Kirim WA segera (best-effort) via after() agar tanda terima cepat sampai.
  // Bila gagal/terputus, cron `/api/cron/send-wa` menjadi penadah (wa_status
  // tetap "pending").
  const nomorTT = await assignNomorTT(admin, pesertaId);
  after(async () => {
    await sendPesertaWa({
      pesertaId,
      noWhatsapp: no_whatsapp,
      template: {
        nomor: formatNomorTT(nomorTT, registeredAt),
        nama, alamat, nominal_donasi,
        tanggal: formatTanggalIndo(registeredAt),
        total_kupon: kupons.length,
      },
    });
  });

  revalidatePath("/peserta");
  revalidatePath("/dashboard");
  return {
    success: tanpaKupon
      ? `Peserta "${nama}" tersimpan tanpa kupon. WA dikirim di latar belakang.`
      : `Peserta "${nama}" tersimpan dengan ${kuponList.length} kupon. WA dikirim di latar belakang.`,
  };
}

export async function resendWaAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const pesertaId = String(formData.get("peserta_id") ?? "");
  if (!pesertaId) return;

  const admin = createAdminClient();
  const { data: peserta } = await admin
    .from("peserta")
    .select("id, nama, alamat, no_whatsapp, nominal_donasi, kelompok_id, nomor_tt, registered_at")
    .eq("id", pesertaId)
    .single();
  if (!peserta) return;
  const p = peserta as {
    id: string; nama: string; alamat: string; no_whatsapp: string;
    nominal_donasi: number | string; kelompok_id: string;
    nomor_tt: number | null; registered_at: string | null;
  };

  if (profile.role !== "admin" && p.kelompok_id !== profile.kelompok_id) return;

  const { count: totalKupon } = await admin
    .from("kupon")
    .select("id", { count: "exact", head: true })
    .eq("peserta_id", pesertaId);

  await admin.from("peserta").update({ wa_status: "pending" }).eq("id", pesertaId);

  const nomorTT = p.nomor_tt ?? (await assignNomorTT(admin, pesertaId));
  after(async () => {
    await sendPesertaWa({
      pesertaId,
      noWhatsapp: p.no_whatsapp,
      template: {
        nomor: formatNomorTT(nomorTT, p.registered_at),
        nama: p.nama, alamat: p.alamat, nominal_donasi: p.nominal_donasi,
        tanggal: formatTanggalIndo(p.registered_at),
        total_kupon: totalKupon ?? 0,
      },
    });
  });

  revalidatePath("/peserta");
}

// ====================== EDIT / HAPUS PESERTA ======================

export type UpdatePesertaState = { error?: string; success?: string } | undefined;

export async function updatePesertaAction(
  _prev: UpdatePesertaState,
  formData: FormData,
): Promise<UpdatePesertaState> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) return { error: "Anda tidak memiliki izin untuk mengubah data peserta." };

  const id = String(formData.get("peserta_id") ?? "").trim();
  const nama = String(formData.get("nama") ?? "").trim();
  const nama_hanzi = String(formData.get("nama_hanzi") ?? "").trim();
  const pinyin = nama_hanzi ? hanziToPinyin(nama_hanzi) : "";
  const alamat = String(formData.get("alamat") ?? "").trim();
  const no_whatsapp = String(formData.get("no_whatsapp") ?? "").trim();
  const nominal_donasi = Number(String(formData.get("nominal_donasi") ?? "").replace(/\D/g, ""));
  const metodeRaw = String(formData.get("metode_bayar") ?? "").trim();
  const metode_bayar = metodeRaw === "cash" || metodeRaw === "transfer" ? metodeRaw : null;
  const buktiFile = formData.get("bukti") as File | null;

  if (!id) return { error: "Peserta tidak valid." };
  if (!nama) return { error: "Nama wajib diisi." };
  if (!alamat) return { error: "Alamat wajib diisi." };

  const admin = createAdminClient();

  const { data: existing } = await admin.from("peserta").select("id, kelompok_id").eq("id", id).single();
  if (!existing) return { error: "Peserta tidak ditemukan." };
  if (profile.role !== "admin" && (existing as { kelompok_id: string }).kelompok_id !== profile.kelompok_id) {
    return { error: "Peserta bukan milik kelompok Anda." };
  }

  const payload: Record<string, unknown> = {
    nama,
    nama_hanzi: nama_hanzi || null,
    pinyin: pinyin || null,
    alamat,
    no_whatsapp,
    nominal_donasi: Number.isFinite(nominal_donasi) ? nominal_donasi : 0,
    metode_bayar,
  };

  if (buktiFile && buktiFile.size > 0) {
    try {
      const path = await uploadBukti(admin, id, buktiFile);
      if (path) payload.bukti_transfer_path = path;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Gagal upload bukti." };
    }
  }

  const { error } = await admin.from("peserta").update(payload).eq("id", id);
  if (error) return { error: `Gagal simpan: ${error.message}` };

  revalidatePath("/peserta");
  revalidatePath(`/peserta/${id}/edit`);
  return { success: "Data peserta diperbarui." };
}

export async function deletePesertaAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canDeletePeserta(profile)) return;
  const id = String(formData.get("peserta_id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  const { data: peserta } = await admin.from("peserta").select("id, kelompok_id").eq("id", id).single();
  if (!peserta) return;
  if (profile.role !== "admin" && (peserta as { kelompok_id: string }).kelompok_id !== profile.kelompok_id) return;

  // Kupon milik peserta: kembalikan yg assigned ke available; tolak bila ada yg sudah ditukar.
  const { data: kupons } = await admin.from("kupon").select("id, status").eq("peserta_id", id);
  const list = (kupons ?? []) as Array<{ id: string; status: string }>;
  if (list.some((k) => k.status === "redeemed")) {
    // Tidak menghapus peserta yang punya kupon sudah ditukar (riwayat penting).
    return;
  }
  if (list.length) {
    await admin
      .from("kupon")
      .update({ status: "available", peserta_id: null, assigned_at: null, assigned_by: null })
      .eq("peserta_id", id);
  }

  await admin.from("peserta").delete().eq("id", id);
  revalidatePath("/peserta");
  revalidatePath("/dashboard");
}

// ====================== KELOLA KUPON YG DI-ASSIGN ======================

export async function assignKuponAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) return;
  const pesertaId = String(formData.get("peserta_id") ?? "").trim();
  const nomor = String(formData.get("nomor_kupon") ?? "").trim().toUpperCase();
  if (!pesertaId || !nomor) return;

  const admin = createAdminClient();
  const { data: peserta } = await admin.from("peserta").select("id, kelompok_id").eq("id", pesertaId).single();
  if (!peserta) return;
  if (profile.role !== "admin" && (peserta as { kelompok_id: string }).kelompok_id !== profile.kelompok_id) return;

  const { data: kupon } = await admin
    .from("kupon")
    .select("id, status, kelompok_id")
    .eq("nomor_kupon", nomor)
    .single();
  if (!kupon) return;
  const k = kupon as { id: string; status: string; kelompok_id: string };
  if (k.status !== "available") return; // hanya kupon yang masih tersedia
  if (profile.role !== "admin" && k.kelompok_id !== profile.kelompok_id) return;

  await admin
    .from("kupon")
    .update({ status: "assigned", peserta_id: pesertaId, assigned_at: new Date().toISOString(), assigned_by: profile.id })
    .eq("id", k.id);

  revalidatePath(`/peserta/${pesertaId}/edit`);
  revalidatePath("/peserta");
}

export async function unassignKuponAction(formData: FormData): Promise<void> {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  if (!canEditPeserta(profile)) return;
  const pesertaId = String(formData.get("peserta_id") ?? "").trim();
  const kuponId = String(formData.get("kupon_id") ?? "").trim();
  if (!pesertaId || !kuponId) return;

  const admin = createAdminClient();
  const { data: kupon } = await admin.from("kupon").select("id, status, peserta_id, kelompok_id").eq("id", kuponId).single();
  if (!kupon) return;
  const k = kupon as { id: string; status: string; peserta_id: string | null; kelompok_id: string };
  if (k.peserta_id !== pesertaId) return;
  if (k.status === "redeemed") return; // tidak boleh lepas kupon yang sudah ditukar
  if (profile.role !== "admin" && k.kelompok_id !== profile.kelompok_id) return;

  await admin
    .from("kupon")
    .update({ status: "available", peserta_id: null, assigned_at: null, assigned_by: null })
    .eq("id", k.id);

  revalidatePath(`/peserta/${pesertaId}/edit`);
  revalidatePath("/peserta");
}
