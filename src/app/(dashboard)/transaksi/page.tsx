import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, ReceiptText, Search, Send } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatTanggalJamWITA } from "@/lib/utils";
import { buildWaMessage, normalizeWaNumber, formatNomorTT, formatTanggalIndo } from "@/lib/wa-template";
import { resendWaAction } from "../peserta/actions";
import { KuponDetailModal } from "./kupon-detail-modal";

// Beri ruang waktu untuk pengiriman WA (Kirim Ulang) via `after()` di serverless.
export const maxDuration = 60;

interface TransaksiRow {
  id: string; nama: string; no_whatsapp: string;
  nominal_donasi: number | string; metode_bayar: string | null;
  nomor_tt: number | null; registered_at: string | null;
  wa_status: string; wa_sent_at: string | null; wa_attempt_count: number;
  kelompok_id: string; kelompok: { nama: string } | null; alamat: string;
}

const PER_OPTIONS = ["20", "40", "60", "100"] as const;
const WA_STATUS_OPTIONS = ["all", "sent", "pending", "failed", "not_sent"] as const;

function waBadge(status: string) {
  switch (status) {
    case "sent": return <Badge variant="success">Terkirim</Badge>;
    case "failed": return <Badge variant="destructive">Gagal</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    default: return <Badge variant="outline">Belum dikirim</Badge>;
  }
}

export default async function TransaksiPage(props: {
  searchParams: Promise<{ kelompok?: string; wa?: string; q?: string; per?: string; page?: string }>;
}) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const sp = await props.searchParams;
  const supabase = await createClient();

  const q = (sp.q ?? "").trim();
  const waStatus = WA_STATUS_OPTIONS.includes(sp.wa as (typeof WA_STATUS_OPTIONS)[number]) ? sp.wa! : "all";
  const per = PER_OPTIONS.includes(sp.per as (typeof PER_OPTIONS)[number]) ? sp.per! : "20";
  const perNum = Number(per);
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const kelompokFilter =
    profile.role === "admin"
      ? (sp.kelompok && sp.kelompok !== "all" ? sp.kelompok : null)
      : profile.kelompok_id;

  const query = supabase
    .from("peserta")
    .select(
      "id, nama, no_whatsapp, alamat, nominal_donasi, metode_bayar, nomor_tt, registered_at, wa_status, wa_sent_at, wa_attempt_count, kelompok_id, kelompok(nama)",
      { count: "exact" },
    )
    .order("registered_at", { ascending: false, nullsFirst: false })
    .gt("nominal_donasi", 0);
  if (kelompokFilter) query.eq("kelompok_id", kelompokFilter);
  if (waStatus !== "all") query.eq("wa_status", waStatus);
  if (q) {
    const like = `%${q}%`;
    query.or(`nama.ilike.${like},no_whatsapp.ilike.${like}`);
  }
  query.range((page - 1) * perNum, page * perNum - 1);

  // Total nominal per metode bayar, mengikuti filter yang sama dengan daftar
  // transaksi (kelompok/status WA/pencarian) tapi mencakup SEMUA halaman.
  function donasiByMetode(metode: "cash" | "transfer") {
    let m = supabase.from("peserta").select("nominal_donasi").gt("nominal_donasi", 0).eq("metode_bayar", metode);
    if (kelompokFilter) m = m.eq("kelompok_id", kelompokFilter);
    if (waStatus !== "all") m = m.eq("wa_status", waStatus);
    if (q) {
      const like = `%${q}%`;
      m = m.or(`nama.ilike.${like},no_whatsapp.ilike.${like}`);
    }
    return m;
  }

  // Total kupon yang sudah diedarkan (diambil peserta), lepas dari filter
  // status WA/pencarian — hanya scope kelompok yang relevan.
  let kuponDiedarkanQuery = supabase
    .from("kupon")
    .select("id", { count: "exact", head: true })
    .in("status", ["assigned", "redeemed"]);
  if (kelompokFilter) kuponDiedarkanQuery = kuponDiedarkanQuery.eq("kelompok_id", kelompokFilter);

  const [
    { data, count },
    { data: kelompokList },
    { data: cashRows },
    { data: transferRows },
    { count: kuponDiedarkan },
  ] = await Promise.all([
    query,
    profile.role === "admin"
      ? supabase.from("kelompok").select("id, nama").order("nama")
      : Promise.resolve({ data: null }),
    donasiByMetode("cash"),
    donasiByMetode("transfer"),
    kuponDiedarkanQuery,
  ]);

  const rows = (data ?? []) as unknown as TransaksiRow[];
  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perNum));

  // Total nominal donasi untuk baris yang tampil di halaman ini.
  const totalNominalHalaman = rows.reduce((sum, r) => sum + Number(r.nominal_donasi || 0), 0);
  const totalCash = ((cashRows ?? []) as { nominal_donasi: number | string }[])
    .reduce((sum, r) => sum + Number(r.nominal_donasi || 0), 0);
  const totalTransfer = ((transferRows ?? []) as { nominal_donasi: number | string }[])
    .reduce((sum, r) => sum + Number(r.nominal_donasi || 0), 0);

  function buildWaLink(p: TransaksiRow, totalKupon: number): string | null {
    const target = normalizeWaNumber(p.no_whatsapp);
    if (!target) return null;
    const message = buildWaMessage({
      nomor: formatNomorTT(p.nomor_tt, p.registered_at),
      nama: p.nama, alamat: p.alamat,
      nominal_donasi: p.nominal_donasi,
      tanggal: formatTanggalIndo(p.registered_at),
      total_kupon: totalKupon,
    });
    return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  }

  // Nomor kupon per peserta — dipakai untuk link WA manual & modal detail kupon.
  const kuponByPeserta = new Map<string, string[]>();
  if (rows.length) {
    const { data: kData } = await supabase
      .from("kupon")
      .select("peserta_id, nomor_kupon")
      .in("peserta_id", rows.map((r) => r.id))
      .order("nomor_kupon");
    for (const k of (kData ?? []) as Array<{ peserta_id: string | null; nomor_kupon: string }>) {
      if (!k.peserta_id) continue;
      const list = kuponByPeserta.get(k.peserta_id) ?? [];
      list.push(k.nomor_kupon);
      kuponByPeserta.set(k.peserta_id, list);
    }
  }
  const kuponCount = new Map<string, number>(
    [...kuponByPeserta.entries()].map(([id, list]) => [id, list.length]),
  );

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (sp.kelompok) params.set("kelompok", sp.kelompok);
    if (waStatus !== "all") params.set("wa", waStatus);
    if (q) params.set("q", q);
    params.set("per", per);
    params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/transaksi?${params.toString()}`;
  }

  const firstShown = total === 0 ? 0 : (page - 1) * perNum + 1;
  const lastShown = Math.min(page * perNum, total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transaksi</h1>
        <p className="text-sm text-muted-foreground">Daftar transaksi donasi peserta & status pengiriman WhatsApp.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Transaksi</p>
            <p className="text-2xl font-bold tabular-nums">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Donasi (halaman ini)</p>
            <p className="text-2xl font-bold tabular-nums">{formatRupiah(totalNominalHalaman)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Transfer</p>
            <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatRupiah(totalTransfer)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Cash</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatRupiah(totalCash)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Kupon Diedarkan</p>
            <p className="text-2xl font-bold tabular-nums text-violet-600 dark:text-violet-400">{kuponDiedarkan ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & pencarian */}
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1 sm:flex-none">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Cari peserta</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" defaultValue={q} placeholder="Nama / no HP" className="w-full pl-9 sm:w-64" />
          </div>
        </div>
        {profile.role === "admin" && (
          <div className="flex-1 space-y-1 sm:flex-none">
            <label htmlFor="kelompok" className="text-xs font-medium text-muted-foreground">Kelompok</label>
            <Select id="kelompok" name="kelompok" defaultValue={sp.kelompok ?? "all"} className="w-full sm:w-44">
              <option value="all">Semua kelompok</option>
              {((kelompokList ?? []) as Array<{ id: string; nama: string }>).map((k) => (
                <option key={k.id} value={k.id}>{k.nama}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="wa" className="text-xs font-medium text-muted-foreground">Status WA</label>
          <Select id="wa" name="wa" defaultValue={waStatus} className="w-full sm:w-40">
            <option value="all">Semua</option>
            <option value="sent">Terkirim</option>
            <option value="pending">Pending</option>
            <option value="failed">Gagal</option>
            <option value="not_sent">Belum dikirim</option>
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
          <CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /> Riwayat Transaksi</CardTitle>
          <CardDescription>Menampilkan {firstShown}–{lastShown} dari {total} transaksi.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Peserta</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead className="text-right">Donasi</TableHead>
                <TableHead>Bayar</TableHead>
                <TableHead>Total Kupon</TableHead>
                <TableHead>Status WA</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {q || waStatus !== "all" ? "Tidak ada transaksi yang cocok dengan filter." : "Belum ada transaksi."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => {
                const kuponList = kuponByPeserta.get(p.id) ?? [];
                const totalKupon = kuponCount.get(p.id) ?? 0;
                const waLink = buildWaLink(p, totalKupon);
                const hasWa = Boolean(normalizeWaNumber(p.no_whatsapp));
                return (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatTanggalJamWITA(p.registered_at)}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{p.nama}</div>
                      <div className="font-mono text-xs text-muted-foreground">{p.no_whatsapp || "-"}</div>
                    </TableCell>
                    <TableCell>{p.kelompok?.nama ?? "-"}</TableCell>
                    <TableCell className="text-right">{formatRupiah(p.nominal_donasi)}</TableCell>
                    <TableCell>
                      {p.metode_bayar ? (
                        <Badge variant={p.metode_bayar === "transfer" ? "secondary" : "outline"} className="w-fit capitalize">
                          {p.metode_bayar}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <KuponDetailModal nama={p.nama} kupon={kuponList} />
                    </TableCell>
                    <TableCell>
                      {waBadge(p.wa_status)}
                      {p.wa_status === "failed" && p.wa_attempt_count > 0 && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{p.wa_attempt_count}x percobaan</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {hasWa && (
                          <form action={resendWaAction}>
                            <input type="hidden" name="peserta_id" value={p.id} />
                            <Button type="submit" variant="outline" size="sm"><Send /> Kirim Ulang</Button>
                          </form>
                        )}
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Buka WhatsApp dengan pesan siap kirim"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400 [&_svg]:size-3.5"
                          >
                            <ExternalLink /> WA Manual
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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
