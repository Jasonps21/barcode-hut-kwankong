import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
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

  const csv = "﻿" + lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="semua-peserta.csv"',
    },
  });
}
