import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, Trash2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggalWITA, formatJamWITA } from "@/lib/utils";
import { deleteErrorLogAction, clearAllErrorLogsAction } from "./actions";
import type { ErrorLog } from "@/types/database";

const PER_OPTIONS = ["20", "40", "60", "100"] as const;

function fmtDateTime(iso: string): string {
  return `${formatTanggalWITA(iso)} ${formatJamWITA(iso, { second: "2-digit" })}`;
}

function sourceBadge(source: string) {
  return source === "client"
    ? <Badge variant="secondary">Client</Badge>
    : <Badge variant="destructive">Server</Badge>;
}

export default async function LogErrorPage(props: {
  searchParams: Promise<{ source?: string; q?: string; per?: string; page?: string; error?: string; deleted?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const admin = createAdminClient();

  const q = (sp.q ?? "").trim();
  const source = sp.source === "server" || sp.source === "client" ? sp.source : "all";
  const per = PER_OPTIONS.includes(sp.per as (typeof PER_OPTIONS)[number]) ? sp.per! : "20";
  const perNum = Number(per);
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const query = admin
    .from("error_logs")
    .select("id, source, message, stack, digest, url, user_agent, context, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (source !== "all") query.eq("source", source);
  if (q) query.ilike("message", `%${q}%`);
  query.range((page - 1) * perNum, page * perNum - 1);

  const { data, count } = await query;
  const rows = (data ?? []) as unknown as ErrorLog[];

  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perNum));

  const serverCount = source === "all"
    ? (await admin.from("error_logs").select("id", { count: "exact", head: true }).eq("source", "server")).count ?? 0
    : null;
  const clientCount = source === "all"
    ? (await admin.from("error_logs").select("id", { count: "exact", head: true }).eq("source", "client")).count ?? 0
    : null;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (source !== "all") params.set("source", source);
    if (q) params.set("q", q);
    params.set("per", per);
    params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/log-error?${params.toString()}`;
  }

  const firstShown = total === 0 ? 0 : (page - 1) * perNum + 1;
  const lastShown = Math.min(page * perNum, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log Error</h1>
          <p className="text-sm text-muted-foreground">Catatan error aplikasi (server & client) — tidak bergantung pada log Vercel.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/log-error"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-4"
          >
            <RefreshCw /> Muat ulang
          </Link>
          {total > 0 && (
            <form action={clearAllErrorLogsAction}>
              <ConfirmButton
                type="submit"
                variant="outline"
                size="default"
                message={`Hapus semua ${total} log error? Tindakan ini tidak bisa dibatalkan.`}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 /> Hapus Semua
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>

      {sp.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">{sp.error}</div>
      )}
      {sp.deleted && (
        <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          Log berhasil dihapus.
        </div>
      )}

      {serverCount !== null && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Log" value={String(total)} />
          <StatCard label="Server" value={String(serverCount)} accent="text-red-600 dark:text-red-400" />
          <StatCard label="Client" value={String(clientCount)} accent="text-amber-600 dark:text-amber-400" />
        </div>
      )}

      {/* Filter & pencarian */}
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1 sm:flex-none">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Cari pesan error</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" defaultValue={q} placeholder="Kata kunci pesan error" className="w-full pl-9 sm:w-72" />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="source" className="text-xs font-medium text-muted-foreground">Sumber</label>
          <Select id="source" name="source" defaultValue={source} className="w-full sm:w-40">
            <option value="all">Semua</option>
            <option value="server">Server</option>
            <option value="client">Client</option>
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
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Riwayat Error</CardTitle>
          <CardDescription>Menampilkan {firstShown}–{lastShown} dari {total} log.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Halaman</TableHead>
                <TableHead>Pesan / Detail</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {q || source !== "all" ? "Tidak ada log yang cocok dengan filter." : "Belum ada error yang tercatat. Aplikasi aman terkendali."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap align-top text-xs">{fmtDateTime(r.created_at)}</TableCell>
                  <TableCell className="align-top">{sourceBadge(r.source)}</TableCell>
                  <TableCell className="max-w-[180px] truncate align-top text-xs text-muted-foreground" title={r.url ?? undefined}>
                    {r.url ?? "-"}
                  </TableCell>
                  <TableCell className="max-w-lg align-top">
                    <p className="break-words text-sm">{r.message}</p>
                    {r.digest && <p className="mt-0.5 font-mono text-xs text-muted-foreground">digest: {r.digest}</p>}
                    {r.stack && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Lihat stack trace</summary>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-[11px] leading-tight">{r.stack}</pre>
                      </details>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <form action={deleteErrorLogAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton
                        type="submit"
                        variant="ghost"
                        size="icon"
                        message="Hapus log error ini?"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 />
                      </ConfirmButton>
                    </form>
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
