import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyWITA, formatTanggalJamWITA } from "@/lib/utils";
import type { KuponStatus } from "@/types/database";

// Bisa ribuan baris (semua kupon tanpa filter) — jangan dibatasi durasi default.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["all", "available", "assigned", "redeemed"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

const STATUS_LABEL: Record<KuponStatus, string> = {
  available: "Belum terassign",
  assigned: "Terassign (belum ditukar)",
  redeemed: "Sudah ditukar",
};

/** Potongan nama file per status, supaya jelas isinya saat file menumpuk di folder Download. */
const STATUS_SLUG: Record<StatusFilter, string> = {
  all: "semua-status",
  available: "belum-terassign",
  assigned: "belum-ditukar",
  redeemed: "sudah-ditukar",
};

interface KuponExportRow {
  nomor_kupon: string;
  status: KuponStatus;
  assigned_at: string | null;
  redeemed_at: string | null;
  kelompok: { nama: string } | null;
  peserta: {
    nama: string;
    nama_hanzi: string | null;
    no_whatsapp: string | null;
    alamat: string | null;
    nomor_tt: number | null;
  } | null;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Supabase membatasi 1000 baris per query, jadi ambil bertahap. */
async function fetchRows(kelompokId: string, status: StatusFilter, q: string): Promise<KuponExportRow[]> {
  const admin = createAdminClient();
  const PAGE = 1000;
  const out: KuponExportRow[] = [];

  for (let from = 0; ; from += PAGE) {
    let query = admin
      .from("kupon")
      .select(
        "nomor_kupon, status, assigned_at, redeemed_at, kelompok:kelompok_id(nama), peserta:peserta_id(nama, nama_hanzi, no_whatsapp, alamat, nomor_tt)",
      )
      .order("nomor_kupon", { ascending: true })
      .range(from, from + PAGE - 1);
    if (kelompokId) query = query.eq("kelompok_id", kelompokId);
    if (status !== "all") query = query.eq("status", status);
    if (q) query = query.ilike("nomor_kupon", `%${q}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as KuponExportRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }

  return out;
}

/**
 * Urut berdasarkan nama peserta (sesuai kebiasaan pencocokan manual di lapangan),
 * lalu nomor kupon. Kupon tanpa peserta ditaruh di akhir, diurut nomor.
 */
function sortByNama(rows: KuponExportRow[]): KuponExportRow[] {
  const collator = new Intl.Collator("id", { sensitivity: "base", numeric: true });
  return [...rows].sort((a, b) => {
    const na = a.peserta?.nama ?? "";
    const nb = b.peserta?.nama ?? "";
    if (!na !== !nb) return na ? -1 : 1;
    const byNama = collator.compare(na, nb);
    return byNama !== 0 ? byNama : collator.compare(a.nomor_kupon, b.nomor_kupon);
  });
}

export async function GET(req: NextRequest) {
  await requireProfile(["admin"]);

  const sp = req.nextUrl.searchParams;
  const kelompokId = sp.get("kelompok") ?? "";
  const statusRaw = sp.get("status") ?? "assigned";
  const status: StatusFilter = STATUS_OPTIONS.includes(statusRaw as StatusFilter)
    ? (statusRaw as StatusFilter)
    : "assigned";
  const q = (sp.get("q") ?? "").trim();
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";

  const rows = sortByNama(await fetchRows(kelompokId, status, q));

  const header = [
    "No",
    "Nama",
    "Nama Hanzi",
    "Nomor TT",
    "Buku",
    "Nomor Kupon (Barcode)",
    "Status",
    "No WhatsApp",
    "Alamat",
    "Waktu Assign",
    "Waktu Tukar",
  ] as const;

  const data = rows.map((r, i) => ({
    No: i + 1,
    Nama: r.peserta?.nama ?? "-",
    "Nama Hanzi": r.peserta?.nama_hanzi ?? "",
    "Nomor TT": r.peserta?.nomor_tt ?? "",
    Buku: r.kelompok?.nama ?? "-",
    "Nomor Kupon (Barcode)": r.nomor_kupon,
    Status: STATUS_LABEL[r.status],
    "No WhatsApp": r.peserta?.no_whatsapp ?? "",
    Alamat: r.peserta?.alamat ?? "",
    "Waktu Assign": formatTanggalJamWITA(r.assigned_at),
    "Waktu Tukar": formatTanggalJamWITA(r.redeemed_at),
  }));

  const filename = `kupon-${STATUS_SLUG[status]}_${dateKeyWITA(new Date().toISOString())}.${format}`;

  if (format === "csv") {
    const lines = [header.join(",")];
    for (const d of data) lines.push(header.map((h) => csvEscape(d[h])).join(","));
    const csv = "﻿" + lines.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(data, { header: [...header] });
  ws["!cols"] = [
    { wch: 5 },  // No
    { wch: 32 }, // Nama
    { wch: 14 }, // Nama Hanzi
    { wch: 10 }, // Nomor TT
    { wch: 30 }, // Buku
    { wch: 22 }, // Nomor Kupon
    { wch: 24 }, // Status
    { wch: 16 }, // No WhatsApp
    { wch: 40 }, // Alamat
    { wch: 20 }, // Waktu Assign
    { wch: 20 }, // Waktu Tukar
  ];
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: header.length - 1 } }),
  };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  // Sheet ringkasan: jumlah kupon per buku + jumlah peserta unik.
  const perBuku = new Map<string, number>();
  for (const r of rows) {
    const nama = r.kelompok?.nama ?? "(tanpa buku)";
    perBuku.set(nama, (perBuku.get(nama) ?? 0) + 1);
  }
  const collator = new Intl.Collator("id", { sensitivity: "base", numeric: true });
  const pesertaUnik = new Set(rows.map((r) => r.peserta?.nama).filter(Boolean)).size;
  const ringkasan: Array<Record<string, string | number>> = [...perBuku.entries()]
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(([Buku, jml]) => ({ Buku, "Jumlah Kupon": jml }));
  ringkasan.push({ Buku: "TOTAL", "Jumlah Kupon": rows.length });
  ringkasan.push({ Buku: "Jumlah peserta (nama unik)", "Jumlah Kupon": pesertaUnik });

  const wsR = XLSX.utils.json_to_sheet(ringkasan, { header: ["Buku", "Jumlah Kupon"] });
  wsR["!cols"] = [{ wch: 34 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Detail Kupon");
  XLSX.utils.book_append_sheet(wb, wsR, "Ringkasan");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
