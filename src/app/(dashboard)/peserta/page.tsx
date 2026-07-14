import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, FileCheck2, Pencil, Search, Send, Trash2 } from "lucide-react";
import { requireProfile, canEditPeserta, canDeletePeserta } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBuktiSignedUrl } from "@/lib/bukti";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/utils";
import { buildWaMessage, normalizeWaNumber, formatNomorTT, formatTanggalIndo } from "@/lib/wa-template";
import { resendWaAction, deletePesertaAction } from "./actions";

// Beri ruang waktu untuk pengiriman WA (Kirim Ulang) via `after()` di serverless.
export const maxDuration = 60;

interface PesertaRow {
  id: string; nama: string; nama_hanzi: string | null; pinyin: string | null;
  alamat: string;
  kota_kabupaten: string | null; provinsi: string | null; keterangan: string | null;
  jenis_usaha: { nama: string } | null;
  no_whatsapp: string; nominal_donasi: number | string;
  metode_bayar: string | null; bukti_transfer_path: string | null;
  nomor_tt: number | null; registered_at: string | null;
  wa_status: string; wa_sent_at: string | null;
  kelompok_id: string; kelompok: { nama: string } | null;
}

const PER_OPTIONS = ["10", "20", "40", "60", "all"] as const;

function waBadge(status: string) {
  switch (status) {
    case "sent": return <Badge variant="success">Terkirim</Badge>;
    case "failed": return <Badge variant="destructive">Gagal</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    default: return <Badge variant="outline">Belum dikirim</Badge>;
  }
}

export default async function PesertaPage(props: {
  searchParams: Promise<{ kelompok?: string; q?: string; per?: string; page?: string }>;
}) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const allowEdit = canEditPeserta(profile);
  const allowDelete = canDeletePeserta(profile);
  const sp = await props.searchParams;
  const supabase = await createClient();

  const q = (sp.q ?? "").trim();
  const per = PER_OPTIONS.includes(sp.per as (typeof PER_OPTIONS)[number]) ? sp.per! : "20";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const showAll = per === "all";
  const perNum = showAll ? 0 : Number(per);

  const kelompokFilter =
    profile.role === "admin"
      ? (sp.kelompok && sp.kelompok !== "all" ? sp.kelompok : null)
      : profile.kelompok_id;

  const query = supabase
    .from("peserta")
    .select(
      "id, nama, nama_hanzi, pinyin, alamat, kota_kabupaten, provinsi, keterangan, jenis_usaha(nama), no_whatsapp, nominal_donasi, metode_bayar, bukti_transfer_path, nomor_tt, registered_at, wa_status, wa_sent_at, kelompok_id, kelompok(nama)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (kelompokFilter) query.eq("kelompok_id", kelompokFilter);
  if (q) {
    const like = `%${q}%`;
    query.or(
      [
        `nama.ilike.${like}`,
        `alamat.ilike.${like}`,
        `no_whatsapp.ilike.${like}`,
        `nama_hanzi.ilike.${like}`,
        `pinyin.ilike.${like}`,
      ].join(","),
    );
  }
  if (!showAll) query.range((page - 1) * perNum, page * perNum - 1);

  const [{ data: peserta, count }, { data: kelompokList }] = await Promise.all([
    query,
    supabase.from("kelompok").select("id, nama").order("nama"),
  ]);

  const rows = (peserta ?? []) as unknown as PesertaRow[];
  const total = count ?? rows.length;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(total / perNum));

  // Hitung jumlah kupon yang ter-assign per peserta (untuk link WA manual).
  const kuponCount = new Map<string, number>();
  if (rows.length) {
    const { data: kData } = await supabase
      .from("kupon")
      .select("peserta_id")
      .in("peserta_id", rows.map((r) => r.id));
    for (const k of (kData ?? []) as Array<{ peserta_id: string | null }>) {
      if (k.peserta_id) kuponCount.set(k.peserta_id, (kuponCount.get(k.peserta_id) ?? 0) + 1);
    }
  }


  // Signed URL bukti transfer (bucket privat) untuk baris yang punya bukti.
  const buktiMap = new Map<string, string>();
  const withBukti = rows.filter((r) => r.bukti_transfer_path);
  if (withBukti.length) {
    const admin = createAdminClient();
    await Promise.all(
      withBukti.map(async (r) => {
        const url = await getBuktiSignedUrl(admin, r.bukti_transfer_path);
        if (url) buktiMap.set(r.id, url);
      }),
    );
  }

  function buildWaLink(p: PesertaRow): string | null {
    const target = normalizeWaNumber(p.no_whatsapp);
    if (!target) return null;
    const message = buildWaMessage({
      nomor: formatNomorTT(p.nomor_tt, p.registered_at),
      nama: p.nama, alamat: p.alamat,
      nominal_donasi: p.nominal_donasi,
      tanggal: formatTanggalIndo(p.registered_at),
      total_kupon: kuponCount.get(p.id) ?? 0,
    });
    return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  }

  // Helper untuk membangun query string yang mempertahankan filter lain.
  function hrefWith(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (sp.kelompok) params.set("kelompok", sp.kelompok);
    if (q) params.set("q", q);
    params.set("per", per);
    params.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/peserta?${params.toString()}`;
  }

  const firstShown = showAll ? (total === 0 ? 0 : 1) : (total === 0 ? 0 : (page - 1) * perNum + 1);
  const lastShown = showAll ? total : Math.min(page * perNum, total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Peserta</h1>
        <p className="text-sm text-muted-foreground">Daftar peserta & status notifikasi WhatsApp.</p>
      </div>

      {/* Filter & pencarian */}
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1 sm:flex-none">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Cari peserta</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" defaultValue={q} placeholder="Nama / alamat / no HP / hanzi" className="w-full pl-9 sm:w-64" />
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
          <label htmlFor="per" className="text-xs font-medium text-muted-foreground">Per halaman</label>
          <Select id="per" name="per" defaultValue={per} className="w-full sm:w-28">
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="40">40</option>
            <option value="60">60</option>
            <option value="all">Semua</option>
          </Select>
        </div>
        {/* reset ke halaman 1 saat filter berubah */}
        <input type="hidden" name="page" value="1" />
        <Button type="submit" variant="outline" size="sm"><Search /> Terapkan</Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{total} Peserta</CardTitle>
          <CardDescription>
            Menampilkan {firstShown}–{lastShown} dari {total}.{" "}
            <b>Kirim Ulang</b> = otomatis via Fonnte. <b>WA Manual</b> = buka WhatsApp dengan pesan siap kirim.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead>No WA</TableHead>
                <TableHead className="text-right">Donasi</TableHead>
                <TableHead>Bayar</TableHead>
                <TableHead>Status WA</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {q ? `Tidak ada peserta cocok dengan "${q}".` : "Belum ada peserta."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => {
                const waLink = buildWaLink(p);
                const hasWa = Boolean(normalizeWaNumber(p.no_whatsapp));
                const buktiUrl = buktiMap.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.nama}</div>
                      {p.nama_hanzi && (
                        <div className="text-xs text-muted-foreground">
                          <span lang="zh">{p.nama_hanzi}</span>
                          {p.pinyin && <span className="italic"> · {p.pinyin}</span>}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">{p.alamat}</div>
                      {(p.kota_kabupaten || p.provinsi) && (
                        <div className="text-xs text-muted-foreground">
                          {[p.kota_kabupaten, p.provinsi].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {(p.jenis_usaha?.nama || p.keterangan) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {p.jenis_usaha?.nama && (
                            <Badge variant="outline" className="text-[10px]">{p.jenis_usaha.nama}</Badge>
                          )}
                          {p.keterangan && <span className="text-xs text-muted-foreground">{p.keterangan}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{p.kelompok?.nama ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.no_whatsapp || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-right">{formatRupiah(p.nominal_donasi)}</TableCell>
                    <TableCell>
                      {p.metode_bayar ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant={p.metode_bayar === "transfer" ? "secondary" : "outline"} className="w-fit capitalize">
                            {p.metode_bayar}
                          </Badge>
                          {buktiUrl && (
                            <a href={buktiUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <FileCheck2 className="h-3 w-3" /> Bukti
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{waBadge(p.wa_status)}</TableCell>
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
                        {allowEdit && (
                          <Link
                            href={`/peserta/${p.id}/edit`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent [&_svg]:size-3.5"
                          >
                            <Pencil /> Edit
                          </Link>
                        )}
                        {allowDelete && (
                          <form action={deletePesertaAction}>
                            <input type="hidden" name="peserta_id" value={p.id} />
                            <ConfirmButton
                              type="submit"
                              variant="outline"
                              size="sm"
                              message={`Hapus peserta "${p.nama}"? Kupon yang ter-assign akan kembali tersedia. Tindakan ini tidak bisa dibatalkan.`}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 /> Hapus
                            </ConfirmButton>
                          </form>
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
      {!showAll && totalPages > 1 && (
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
