import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatJamWITA, formatRupiah, formatTanggalWITA } from "@/lib/utils";

// File bisa besar (ribuan baris + render PDF) — jangan dibatasi durasi default.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Baris terlalu banyak untuk PDF jadi berat & lama di-render; sarankan CSV/Excel atau persempit tanggal. */
const PDF_MAX_ROWS = 3000;

interface RegistrasiRow {
  nama: string;
  nominal_donasi: number | string;
  metode_bayar: string | null;
  registered_at: string | null;
  created_by: string | null;
  kelompok: { nama: string } | null;
}

function dayRange(from: string, to: string) {
  const fromISO = from ? `${from}T00:00:00` : null;
  const toISO = to ? `${to}T23:59:59.999` : null;
  return { fromISO, toISO };
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function getRows(from: string, to: string, metode: string) {
  const admin = createAdminClient();
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
  const rows = (data ?? []) as unknown as RegistrasiRow[];

  const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  const petugas = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, nama").in("id", ids);
    for (const p of (profs ?? []) as Array<{ id: string; nama: string }>) petugas.set(p.id, p.nama);
  }

  let totalCash = 0;
  let totalTransfer = 0;
  for (const r of rows) {
    const n = Number(r.nominal_donasi ?? 0);
    if (r.metode_bayar === "transfer") totalTransfer += n;
    else if (r.metode_bayar === "cash") totalCash += n;
  }

  return { rows, petugas, totalCash, totalTransfer };
}

function periodeLabel(from: string, to: string, metode: string): string {
  const rentang = from || to ? `${from || "…"} s/d ${to || "…"}` : "Semua waktu";
  const metodeLabel = metode === "cash" ? "Cash" : metode === "transfer" ? "Transfer" : "Semua metode";
  return `${rentang} · ${metodeLabel}`;
}

function filenameFor(from: string, to: string, ext: string): string {
  const tgl = from || to ? `${from || "awal"}_${to || "akhir"}` : "semua";
  return `rekap-uang-masuk_${tgl}.${ext}`;
}

const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#555", marginBottom: 12 },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  summaryBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    padding: 8,
  },
  summaryLabel: { fontSize: 8, color: "#666", marginBottom: 3 },
  summaryValue: { fontSize: 12, fontWeight: 700 },
  table: { display: "flex", width: "100%", borderWidth: 1, borderColor: "#ddd" },
  tr: { flexDirection: "row" },
  trHeader: { flexDirection: "row", backgroundColor: "#1c1b18" },
  th: { color: "#fff", fontSize: 8, fontWeight: 700, padding: 5, borderRightWidth: 1, borderRightColor: "#333" },
  td: { fontSize: 8, padding: 5, borderRightWidth: 1, borderRightColor: "#eee", borderTopWidth: 1, borderTopColor: "#eee" },
  trZebra: { backgroundColor: "#fafafa" },
  colTgl: { width: "13%" },
  colJam: { width: "8%" },
  colNama: { width: "24%" },
  colKelompok: { width: "16%" },
  colMetode: { width: "11%" },
  colNominal: { width: "15%", textAlign: "right" },
  colPetugas: { width: "13%", borderRightWidth: 0 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7, color: "#999", textAlign: "center" },
});

function UangMasukPdf({
  rows,
  petugas,
  totalCash,
  totalTransfer,
  periode,
}: {
  rows: RegistrasiRow[];
  petugas: Map<string, string>;
  totalCash: number;
  totalTransfer: number;
  periode: string;
}) {
  const totalKeseluruhan = totalCash + totalTransfer;
  const dibuat = new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar", dateStyle: "long", timeStyle: "short" });

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page} wrap>
        <Text style={pdfStyles.title}>Rekap Uang Masuk</Text>
        <Text style={pdfStyles.subtitle}>{periode}</Text>

        <View style={pdfStyles.summaryRow}>
          <View style={pdfStyles.summaryBox}>
            <Text style={pdfStyles.summaryLabel}>Total Cash</Text>
            <Text style={pdfStyles.summaryValue}>{formatRupiah(totalCash)}</Text>
          </View>
          <View style={pdfStyles.summaryBox}>
            <Text style={pdfStyles.summaryLabel}>Total Transfer</Text>
            <Text style={pdfStyles.summaryValue}>{formatRupiah(totalTransfer)}</Text>
          </View>
          <View style={pdfStyles.summaryBox}>
            <Text style={pdfStyles.summaryLabel}>Total Keseluruhan</Text>
            <Text style={pdfStyles.summaryValue}>{formatRupiah(totalKeseluruhan)}</Text>
          </View>
          <View style={pdfStyles.summaryBox}>
            <Text style={pdfStyles.summaryLabel}>Jumlah Registrasi</Text>
            <Text style={pdfStyles.summaryValue}>{rows.length}</Text>
          </View>
        </View>

        <View style={pdfStyles.table}>
          <View style={pdfStyles.trHeader} fixed>
            <Text style={[pdfStyles.th, pdfStyles.colTgl]}>Tanggal</Text>
            <Text style={[pdfStyles.th, pdfStyles.colJam]}>Jam</Text>
            <Text style={[pdfStyles.th, pdfStyles.colNama]}>Nama</Text>
            <Text style={[pdfStyles.th, pdfStyles.colKelompok]}>Kelompok</Text>
            <Text style={[pdfStyles.th, pdfStyles.colMetode]}>Metode</Text>
            <Text style={[pdfStyles.th, pdfStyles.colNominal]}>Nominal</Text>
            <Text style={[pdfStyles.th, pdfStyles.colPetugas, { borderRightWidth: 0 }]}>Petugas</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={[pdfStyles.tr, i % 2 === 1 ? pdfStyles.trZebra : {}]} wrap={false}>
              <Text style={[pdfStyles.td, pdfStyles.colTgl]}>{formatTanggalWITA(r.registered_at)}</Text>
              <Text style={[pdfStyles.td, pdfStyles.colJam]}>{formatJamWITA(r.registered_at)}</Text>
              <Text style={[pdfStyles.td, pdfStyles.colNama]}>{r.nama}</Text>
              <Text style={[pdfStyles.td, pdfStyles.colKelompok]}>{r.kelompok?.nama ?? "-"}</Text>
              <Text style={[pdfStyles.td, pdfStyles.colMetode]}>{r.metode_bayar ?? "-"}</Text>
              <Text style={[pdfStyles.td, pdfStyles.colNominal]}>{formatRupiah(r.nominal_donasi)}</Text>
              <Text style={[pdfStyles.td, pdfStyles.colPetugas, { borderRightWidth: 0 }]}>
                {r.created_by ? petugas.get(r.created_by) ?? "-" : "-"}
              </Text>
            </View>
          ))}
        </View>

        <Text
          style={pdfStyles.footer}
          render={({ pageNumber, totalPages }) => `Dibuat ${dibuat} · Halaman ${pageNumber}/${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  await requireProfile(["admin"]);

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const metodeRaw = sp.get("metode") ?? "all";
  const metode = metodeRaw === "cash" || metodeRaw === "transfer" ? metodeRaw : "all";
  const format = sp.get("format") ?? "csv";

  const { rows, petugas, totalCash, totalTransfer } = await getRows(from, to, metode);
  const periode = periodeLabel(from, to, metode);

  if (format === "xlsx") {
    const data = rows.map((r) => ({
      Tanggal: formatTanggalWITA(r.registered_at),
      Jam: formatJamWITA(r.registered_at),
      Nama: r.nama,
      Kelompok: r.kelompok?.nama ?? "-",
      Metode: r.metode_bayar ?? "-",
      Nominal: Number(r.nominal_donasi ?? 0),
      Petugas: r.created_by ? petugas.get(r.created_by) ?? "-" : "-",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Uang Masuk");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameFor(from, to, "xlsx")}"`,
      },
    });
  }

  if (format === "pdf") {
    if (rows.length > PDF_MAX_ROWS) {
      return new NextResponse(
        `Data terlalu banyak untuk PDF (${rows.length} baris, maks ${PDF_MAX_ROWS}). Persempit rentang tanggal, atau gunakan format Excel/CSV untuk data lengkap.`,
        { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    const buf = await renderToBuffer(
      <UangMasukPdf rows={rows} petugas={petugas} totalCash={totalCash} totalTransfer={totalTransfer} periode={periode} />,
    );
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameFor(from, to, "pdf")}"`,
      },
    });
  }

  // default: CSV
  const header = ["Tanggal", "Jam", "Nama", "Kelompok", "Metode", "Nominal", "Petugas"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatTanggalWITA(r.registered_at),
        formatJamWITA(r.registered_at),
        r.nama,
        r.kelompok?.nama ?? "-",
        r.metode_bayar ?? "-",
        r.nominal_donasi,
        r.created_by ? petugas.get(r.created_by) ?? "-" : "-",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const csv = "﻿" + lines.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameFor(from, to, "csv")}"`,
    },
  });
}
