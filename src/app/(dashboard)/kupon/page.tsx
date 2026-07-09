import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Ticket } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggalJamWITA } from "@/lib/utils";
import type { KuponStatus } from "@/types/database";

interface KuponRow {
  nomor_kupon: string;
  status: KuponStatus;
  assigned_at: string | null;
  redeemed_at: string | null;
  peserta: { nama: string; nomor_tt: number | null } | null;
}

const PER_OPTIONS = ["50", "100", "200", "500"] as const;
const STATUS_OPTIONS = ["all", "available", "assigned", "redeemed"] as const;

function statusBadge(status: KuponStatus) {
  switch (status) {
    case "redeemed": return <Badge variant="success">Sudah ditukar</Badge>;
    case "assigned": return <Badge variant="warning">Terassign (belum ditukar)</Badge>;
    default: return <Badge variant="outline">Belum terassign</Badge>;
  }
}

export default async function KuponPage(props: {
  searchParams: Promise<{ kelompok?: string; status?: string; q?: string; per?: string; page?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const supabase = await createClient();

  const { data: kelompokData } = await supabase
    .from("kelompok")
    .select("id, nama, prefix, range_start, range_end, padding")
    .order("created_at", { ascending: true });
  const kelompokList = (kelompokData ?? []) as Array<{
    id: string; nama: string; prefix: string; range_start: number; range_end: number; padding: number;
  }>;

  // Kelompok yang dipilih — default ke kelompok pertama supaya halaman selalu
  // menampilkan data yang berarti untuk cross-check.
  const selectedKelompok =
    sp.kelompok && kelompokList.some((k) => k.id === sp.kelompok)
      ? sp.kelompok
      : kelompokList[0]?.id ?? null;
  const kelompok = kelompokList.find((k) => k.id === selectedKelompok) ?? null;

  const q = (sp.q ?? "").trim();
  const status = STATUS_OPTIONS.includes(sp.status as (typeof STATUS_OPTIONS)[number]) ? sp.status! : "all";
  const per = PER_OPTIONS.includes(sp.per as (typeof PER_OPTIONS)[number]) ? sp.per! : "100";
  const perNum = Number(per);
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // Ringkasan jumlah per status untuk kelompok terpilih (semua halaman).
  const kelompokScope = selectedKelompok ?? "";
  const [totalRes, availRes, assignedRes, redeemedRes] = await Promise.all([
    supabase.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", kelompokScope),
    supabase.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", kelompokScope).eq("status", "available"),
    supabase.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", kelompokScope).eq("status", "assigned"),
    supabase.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", kelompokScope).eq("status", "redeemed"),
  ]);
  const summary = {
    total: totalRes.count ?? 0,
    available: availRes.count ?? 0,
    assigned: assignedRes.count ?? 0,
    redeemed: redeemedRes.count ?? 0,
  };

  // Daftar kupon (dengan filter & paging).
  let listQuery = supabase
    .from("kupon")
    .select("nomor_kupon, status, assigned_at, redeemed_at, peserta:peserta_id(nama, nomor_tt)", { count: "exact" })
    .order("nomor_kupon", { ascending: true });
  if (selectedKelompok) listQuery = listQuery.eq("kelompok_id", selectedKelompok);
  if (status !== "all") listQuery = listQuery.eq("status", status);
  if (q) listQuery = listQuery.ilike("nomor_kupon", `%${q}%`);
  listQuery = listQuery.range((page - 1) * perNum, page * perNum - 1);

  const { data: listData, count } = await listQuery;
  const rows = (listData ?? []) as unknown as KuponRow[];
  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perNum));
  const firstShown = total === 0 ? 0 : (page - 1) * perNum + 1;
  const lastShown = Math.min(page * perNum, total);

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (selectedKelompok) params.set("kelompok", selectedKelompok);
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    params.set("per", per);
    params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/kupon?${params.toString()}`;
  }

  const rangeLabel = kelompok
    ? `${kelompok.prefix}${String(kelompok.range_start).padStart(kelompok.padding, "0")} – ${kelompok.prefix}${String(kelompok.range_end).padStart(kelompok.padding, "0")}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cek Kupon</h1>
        <p className="text-sm text-muted-foreground">
          Cross-check kupon per kelompok: mana yang sudah terassign, sudah ditukar, dan yang masih kosong.
        </p>
      </div>

      {kelompokList.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Belum ada kelompok. Buat kelompok terlebih dahulu di menu Kelompok.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Ringkasan status kupon untuk kelompok terpilih */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Kupon</p>
                <p className="text-2xl font-bold tabular-nums">{summary.total}</p>
                {rangeLabel && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{rangeLabel}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Belum Terassign</p>
                <p className="text-2xl font-bold tabular-nums text-slate-600 dark:text-slate-300">{summary.available}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Kupon fisik yang belum diberikan</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Terassign (belum ditukar)</p>
                <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{summary.assigned}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Sudah dipegang peserta</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Sudah Ditukar</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{summary.redeemed}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Bingkisan sudah diambil</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter & pencarian */}
          <form className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1 sm:flex-none">
              <label htmlFor="kelompok" className="text-xs font-medium text-muted-foreground">Kelompok</label>
              <Select id="kelompok" name="kelompok" defaultValue={selectedKelompok ?? ""} className="w-full sm:w-52">
                {kelompokList.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="status" className="text-xs font-medium text-muted-foreground">Status</label>
              <Select id="status" name="status" defaultValue={status} className="w-full sm:w-52">
                <option value="all">Semua status</option>
                <option value="available">Belum terassign</option>
                <option value="assigned">Terassign (belum ditukar)</option>
                <option value="redeemed">Sudah ditukar</option>
              </Select>
            </div>
            <div className="flex-1 space-y-1 sm:flex-none">
              <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Cari nomor kupon</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="q" name="q" defaultValue={q} placeholder="mis. 0398" className="w-full pl-9 sm:w-48" />
              </div>
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
              <CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" /> Daftar Kupon</CardTitle>
              <CardDescription>Menampilkan {firstShown}–{lastShown} dari {total} kupon.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nomor Kupon</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Peserta</TableHead>
                    <TableHead>Waktu Assign</TableHead>
                    <TableHead>Waktu Tukar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        {q || status !== "all" ? "Tidak ada kupon yang cocok dengan filter." : "Belum ada kupon."}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((k) => (
                    <TableRow key={k.nomor_kupon}>
                      <TableCell className="font-mono font-medium">{k.nomor_kupon}</TableCell>
                      <TableCell>{statusBadge(k.status)}</TableCell>
                      <TableCell>
                        {k.peserta ? (
                          <div>
                            <div className="text-sm font-medium">{k.peserta.nama}</div>
                            {k.peserta.nomor_tt != null && (
                              <div className="font-mono text-xs text-muted-foreground">TT {k.peserta.nomor_tt}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatTanggalJamWITA(k.assigned_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatTanggalJamWITA(k.redeemed_at)}</TableCell>
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
        </>
      )}
    </div>
  );
}
