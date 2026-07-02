import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquare, RefreshCw, Search } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggalWITA, formatJamWITA } from "@/lib/utils";

interface WaLogRow {
  id: string;
  peserta_id: string | null;
  status: string;
  fonnte_response: unknown;
  error_message: string | null;
  sent_at: string;
  peserta: { nama: string; no_whatsapp: string; kelompok: { nama: string } | null } | null;
}

const PER_OPTIONS = ["20", "40", "60", "100"] as const;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "-";
  return `${formatTanggalWITA(iso)} ${formatJamWITA(iso, { second: "2-digit" })}`;
}

function statusBadge(status: string) {
  return status === "sent"
    ? <Badge variant="success">Terkirim</Badge>
    : <Badge variant="destructive">Gagal</Badge>;
}

function summarizeResponse(resp: unknown): string {
  if (resp == null) return "-";
  if (typeof resp === "string") return resp;
  try {
    return JSON.stringify(resp);
  } catch {
    return String(resp);
  }
}

export default async function WaLogPage(props: {
  searchParams: Promise<{ status?: string; q?: string; per?: string; page?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const admin = createAdminClient();

  const q = (sp.q ?? "").trim();
  const status = sp.status === "sent" || sp.status === "failed" ? sp.status : "all";
  const per = PER_OPTIONS.includes(sp.per as (typeof PER_OPTIONS)[number]) ? sp.per! : "20";
  const perNum = Number(per);
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // Saat mencari peserta, pakai inner join agar count & paginasi akurat
  // (baris log tanpa peserta cocok ikut terbuang oleh `!inner`).
  const pesertaJoin = q ? "peserta!inner" : "peserta";
  const query = admin
    .from("wa_log")
    .select(
      `id, peserta_id, status, fonnte_response, error_message, sent_at, ${pesertaJoin}(nama, no_whatsapp, kelompok(nama))`,
      { count: "exact" },
    )
    .order("sent_at", { ascending: false });
  if (status !== "all") query.eq("status", status);
  if (q) {
    const like = `%${q}%`;
    query.or(`nama.ilike.${like},no_whatsapp.ilike.${like}`, { referencedTable: "peserta" });
  }
  query.range((page - 1) * perNum, page * perNum - 1);

  const { data, count } = await query;
  const rows = (data ?? []) as unknown as WaLogRow[];

  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perNum));

  const sentCount = status === "all"
    ? (await admin.from("wa_log").select("id", { count: "exact", head: true }).eq("status", "sent")).count ?? 0
    : null;
  const failedCount = status === "all"
    ? (await admin.from("wa_log").select("id", { count: "exact", head: true }).eq("status", "failed")).count ?? 0
    : null;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    params.set("per", per);
    params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/wa-log?${params.toString()}`;
  }

  const firstShown = total === 0 ? 0 : (page - 1) * perNum + 1;
  const lastShown = Math.min(page * perNum, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Riwayat pengiriman notifikasi WhatsApp via Fonnte.</p>
        </div>
        <Link
          href="/wa-log"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-4"
        >
          <RefreshCw /> Muat ulang
        </Link>
      </div>

      {sentCount !== null && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Log" value={String(total)} />
          <StatCard label="Terkirim" value={String(sentCount)} accent="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Gagal" value={String(failedCount)} accent="text-red-600 dark:text-red-400" />
        </div>
      )}

      {/* Filter & pencarian */}
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1 sm:flex-none">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Cari peserta</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" defaultValue={q} placeholder="Nama / no HP" className="w-full pl-9 sm:w-64" />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">Status</label>
          <Select id="status" name="status" defaultValue={status} className="w-full sm:w-40">
            <option value="all">Semua</option>
            <option value="sent">Terkirim</option>
            <option value="failed">Gagal</option>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="per" className="text-xs font-medium text-muted-foreground">Per halaman</label>
          <Select id="per" name="per" defaultValue={per} className="w-full sm:w-28">
            {PER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </div>
        <input type="hidden" name="page" value="1" />
        <Button type="submit" variant="outline" size="sm"><Search /> Terapkan</Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Riwayat Pengiriman</CardTitle>
          <CardDescription>Menampilkan {firstShown}–{lastShown} dari {total} log.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Peserta</TableHead>
                <TableHead>No WA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail / Respons Fonnte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {q || status !== "all" ? "Tidak ada log yang cocok dengan filter." : "Belum ada log pengiriman WhatsApp."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(r.sent_at)}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{r.peserta?.nama ?? <span className="text-muted-foreground">(peserta dihapus)</span>}</div>
                    <div className="text-xs text-muted-foreground">{r.peserta?.kelompok?.nama ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.peserta?.no_whatsapp ?? "-"}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="max-w-md">
                    {r.error_message
                      ? <span className="text-xs text-red-600 dark:text-red-400">{r.error_message}</span>
                      : <span className="break-all font-mono text-xs text-muted-foreground">{summarizeResponse(r.fonnte_response)}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paging */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Halaman {page} dari {totalPages}</p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={hrefWith({ page: String(page - 1) })} className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent [&_svg]:size-4">
                <ChevronLeft /> Sebelumnya
              </Link>
            ) : (
              <span className="inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium text-muted-foreground opacity-50 [&_svg]:size-4"><ChevronLeft /> Sebelumnya</span>
            )}
            {page < totalPages ? (
              <Link href={hrefWith({ page: String(page + 1) })} className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent [&_svg]:size-4">
                Berikutnya <ChevronRight />
              </Link>
            ) : (
              <span className="inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium text-muted-foreground opacity-50 [&_svg]:size-4">Berikutnya <ChevronRight /></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
