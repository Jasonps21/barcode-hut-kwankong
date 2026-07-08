import Link from "next/link";
import { ChevronLeft, ChevronRight, History, RefreshCw, Search } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggalWITA, formatJamWITA } from "@/lib/utils";
import type { LogAktivitas } from "@/types/database";

const PER_OPTIONS = ["20", "40", "60", "100"] as const;

const AKSI_LABEL: Record<string, string> = {
  create_peserta: "Tambah Peserta",
  update_peserta: "Ubah Peserta",
  register_peserta_impor: "Daftar via Scan",
  create_kelompok: "Tambah Kelompok",
  redeem_kupon: "Tukar Kupon",
};

function fmtDateTime(iso: string): string {
  return `${formatTanggalWITA(iso)} ${formatJamWITA(iso, { second: "2-digit" })}`;
}

function aksiBadge(aksi: string) {
  const label = AKSI_LABEL[aksi] ?? aksi;
  const variant = aksi.startsWith("update") ? "warning" : aksi.startsWith("create") || aksi.startsWith("register") ? "success" : "secondary";
  return <Badge variant={variant as "warning" | "success" | "secondary"}>{label}</Badge>;
}

export default async function LogAktivitasPage(props: {
  searchParams: Promise<{ aksi?: string; q?: string; per?: string; page?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const admin = createAdminClient();

  const q = (sp.q ?? "").trim();
  const aksiFilter = (sp.aksi ?? "all").trim();
  const per = PER_OPTIONS.includes(sp.per as (typeof PER_OPTIONS)[number]) ? sp.per! : "20";
  const perNum = Number(per);
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const query = admin
    .from("log_aktivitas")
    .select("id, user_id, aksi, tabel_terkait, record_id, detail, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (aksiFilter !== "all") query.eq("aksi", aksiFilter);
  if (q) query.or(`tabel_terkait.ilike.%${q}%,record_id.ilike.%${q}%`);
  query.range((page - 1) * perNum, page * perNum - 1);

  const { data, count } = await query;
  const rows = (data ?? []) as unknown as LogAktivitas[];

  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
  const userMap = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await admin.from("profiles").select("id, nama").in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id: string; nama: string }>) userMap.set(p.id, p.nama);
  }

  const { data: aksiRows } = await admin.from("log_aktivitas").select("aksi").limit(1000);
  const aksiOptions = [...new Set((aksiRows ?? []).map((r) => (r as { aksi: string }).aksi))].sort();

  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perNum));

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (aksiFilter !== "all") params.set("aksi", aksiFilter);
    if (q) params.set("q", q);
    params.set("per", per);
    params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/log-aktivitas?${params.toString()}`;
  }

  const firstShown = total === 0 ? 0 : (page - 1) * perNum + 1;
  const lastShown = Math.min(page * perNum, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log Aktivitas</h1>
          <p className="text-sm text-muted-foreground">Riwayat perubahan data (tambah/ubah) oleh pengguna — untuk audit.</p>
        </div>
        <Link
          href="/log-aktivitas"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-4"
        >
          <RefreshCw /> Muat ulang
        </Link>
      </div>

      {/* Filter & pencarian */}
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1 sm:flex-none">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Cari tabel / ID record</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" defaultValue={q} placeholder="mis. peserta / kupon" className="w-full pl-9 sm:w-64" />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="aksi" className="text-xs font-medium text-muted-foreground">Aksi</label>
          <Select id="aksi" name="aksi" defaultValue={aksiFilter} className="w-full sm:w-52">
            <option value="all">Semua aksi</option>
            {aksiOptions.map((a) => <option key={a} value={a}>{AKSI_LABEL[a] ?? a}</option>)}
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
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Riwayat Aktivitas</CardTitle>
          <CardDescription>Menampilkan {firstShown}–{lastShown} dari {total} log.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Pengguna</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Tabel / Record</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {q || aksiFilter !== "all" ? "Tidak ada log yang cocok dengan filter." : "Belum ada aktivitas yang tercatat."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap align-top text-xs">{fmtDateTime(r.created_at)}</TableCell>
                  <TableCell className="align-top text-sm">{r.user_id ? (userMap.get(r.user_id) ?? "-") : "-"}</TableCell>
                  <TableCell className="align-top">{aksiBadge(r.aksi)}</TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {r.tabel_terkait ?? "-"}
                    {r.record_id && <div className="font-mono">{r.record_id}</div>}
                  </TableCell>
                  <TableCell className="max-w-lg align-top">
                    {r.detail ? (
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-[11px] leading-tight">
                        {JSON.stringify(r.detail, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
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
