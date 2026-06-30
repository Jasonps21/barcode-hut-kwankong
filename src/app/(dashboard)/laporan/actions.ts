"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportPesertaCsv(): Promise<void> {
  await requireProfile(["admin"]);
  const admin = createAdminClient();

  const { data } = await admin
    .from("peserta")
    .select("nama, alamat, no_whatsapp, nominal_donasi, wa_status, wa_sent_at, created_at, kelompok(nama)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<{
    nama: string; alamat: string; no_whatsapp: string;
    nominal_donasi: number | string; wa_status: string;
    wa_sent_at: string | null; created_at: string;
    kelompok: { nama: string } | null;
  }>;

  const header = ["Nama", "Alamat", "No WhatsApp", "Nominal Donasi", "Kelompok", "Status WA", "Dikirim Pada", "Dibuat Pada"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.nama, r.alamat, r.no_whatsapp, r.nominal_donasi,
      r.kelompok?.nama ?? "", r.wa_status, r.wa_sent_at ?? "", r.created_at,
    ].map(csvEscape).join(","));
  }

  const csv = lines.join("\n");
  const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  redirect(dataUrl);
}

/** Rentang waktu dari input date (YYYY-MM-DD) -> ISO awal & akhir hari. */
function dayRange(from: string, to: string) {
  const fromISO = from ? `${from}T00:00:00` : null;
  const toISO = to ? `${to}T23:59:59.999` : null;
  return { fromISO, toISO };
}

/** Export rekap uang masuk (registrasi) terfilter — untuk dicocokkan dgn mutasi bank. */
export async function exportUangMasukCsv(formData: FormData): Promise<void> {
  await requireProfile(["admin"]);
  const admin = createAdminClient();

  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const metode = String(formData.get("metode") ?? "all");
  const { fromISO, toISO } = dayRange(from, to);

  let q = admin
    .from("peserta")
    .select("nama, nominal_donasi, metode_bayar, registered_at, created_by, kelompok(nama)")
    .not("registered_at", "is", null)
    .order("registered_at", { ascending: true });
  if (fromISO) q = q.gte("registered_at", fromISO);
  if (toISO) q = q.lte("registered_at", toISO);
  if (metode === "cash" || metode === "transfer") q = q.eq("metode_bayar", metode);

  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    nama: string; nominal_donasi: number | string; metode_bayar: string | null;
    registered_at: string | null; created_by: string | null; kelompok: { nama: string } | null;
  }>;

  // map petugas
  const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  const petugas = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, nama").in("id", ids);
    for (const p of (profs ?? []) as Array<{ id: string; nama: string }>) petugas.set(p.id, p.nama);
  }

  const header = ["Tanggal", "Jam", "Nama", "Kelompok", "Metode", "Nominal", "Petugas"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const d = r.registered_at ? new Date(r.registered_at) : null;
    lines.push([
      d ? d.toLocaleDateString("id-ID") : "",
      d ? d.toLocaleTimeString("id-ID") : "",
      r.nama, r.kelompok?.nama ?? "", r.metode_bayar ?? "",
      r.nominal_donasi, r.created_by ? petugas.get(r.created_by) ?? "" : "",
    ].map(csvEscape).join(","));
  }

  const csv = lines.join("\n");
  redirect("data:text/csv;charset=utf-8," + encodeURIComponent(csv));
}
