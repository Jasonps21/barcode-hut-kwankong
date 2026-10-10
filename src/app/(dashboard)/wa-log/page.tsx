import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquare, RefreshCw, Search, ShieldOff } from "lucide-react";
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
import { normalizeWaNumber } from "@/lib/wa-template";
import { ringkasanKuotaWa, ringkasanPengecualian } from "@/lib/whatsapp";
import { tandaiNomorInvalidAction } from "./actions";
import { PilihAntre, type KandidatRow } from "./pilih-antre";

interface WaLogRow {
  id: string;
  donasi_id: string | null;
  status: string;
  fonnte_response: unknown;
  error_message: string | null;
  sent_at: string;
  donasi: {
    anggota: { id: string; nama: string; no_whatsapp: string | null } | null;
    kelompok: { nama: string } | null;
  } | null;
  /** Log sebelum model multi-kegiatan yang pesertanya tidak punya setoran. */
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
  searchParams: Promise<{
    status?: string; q?: string; per?: string; page?: string;
    // Filter pemilih peserta di kartu "Antre ulang" — sengaja diberi awalan
    // `a` agar tidak bentrok dengan filter tabel log di bawahnya.
    ak?: string; astat?: string; aq?: string; ap?: string;
  }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const admin = createAdminClient();

  const q = (sp.q ?? "").trim();
  const status = sp.status === "sent" || sp.status === "failed" ? sp.status : "all";
  const per = PER_OPTIONS.includes(sp.per as (typeof PER_OPTIONS)[number]) ? sp.per! : "20";
  const perNum = Number(per);
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // Saat mencari anggota, pakai inner join agar count & paginasi akurat
  // (baris log tanpa anggota cocok ikut terbuang oleh `!inner`).
  const donasiJoin = q ? "donasi!inner" : "donasi";
  const anggotaJoin = q ? "anggota!inner" : "anggota";
  const query = admin
    .from("wa_log")
    .select(
      `id, donasi_id, status, fonnte_response, error_message, sent_at, ${donasiJoin}(${anggotaJoin}(id, nama, no_whatsapp), kelompok:kelompok_id(nama)), peserta(nama, no_whatsapp, kelompok(nama))`,
      { count: "exact" },
    )
    .order("sent_at", { ascending: false });
  if (status !== "all") query.eq("status", status);
  if (q) {
    const like = `%${q}%`;
    query.or(`nama.ilike.${like},no_whatsapp.ilike.${like}`, { referencedTable: "donasi.anggota" });
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

  // Ringkasan antrean pengiriman, dihitung dari setoran (bukan log).
  const hitungPeserta = async (waStatus: string) =>
    (await admin
      .from("donasi")
      .select("id", { count: "exact", head: true })
      .eq("wa_status", waStatus)).count ?? 0;

  const pesertaGagal = await hitungPeserta("failed");
  const pesertaAntre = await hitungPeserta("pending");

  // Sisa jatah 24 jam bergulir; batasnya dipegang @/lib/whatsapp.
  const kuota = await ringkasanKuotaWa();
  const kecuali = await ringkasanPengecualian();

  // ---------------------------------------------------------------------
  // Pemilih setoran untuk antre ulang.
  //
  // Daftarnya diambil terpisah dari tabel log karena yang dipilih adalah
  // SETORAN, bukan baris log: satu setoran bisa punya belasan baris log gagal,
  // dan mengantre "baris log" tidak punya arti.
  // ---------------------------------------------------------------------
  const aStatusOptions = ["failed", "pending", "not_sent", "sent", "dikecualikan", "all"] as const;
  const aStat = aStatusOptions.includes(sp.astat as (typeof aStatusOptions)[number])
    ? sp.astat!
    : "failed";
  const aq = (sp.aq ?? "").trim();
  const aKelompok = sp.ak && sp.ak !== "all" ? sp.ak : null;
  const aPage = Math.max(1, Number(sp.ap ?? "1") || 1);
  const A_PER = 100;

  const kandidatQuery = admin
    .from("donasi_lengkap")
    .select(
      "id, nama, no_whatsapp, wa_status, wa_dikecualikan, wa_alasan_kecuali, kelompok:kelompok_id(nama)",
      { count: "exact" },
    )
    .order("registered_at", { ascending: true })
    .order("id", { ascending: true });

  if (aStat === "dikecualikan") kandidatQuery.eq("wa_dikecualikan", true);
  else if (aStat !== "all") kandidatQuery.eq("wa_status", aStat).eq("wa_dikecualikan", false);

  if (aKelompok) kandidatQuery.eq("kelompok_id", aKelompok);
  if (aq) {
    const like = `%${aq}%`;
    kandidatQuery.or(`nama.ilike.${like},no_whatsapp.ilike.${like}`);
  }
  kandidatQuery.range((aPage - 1) * A_PER, aPage * A_PER - 1);

  const [{ data: kandidatData, count: kandidatCount }, { data: kelompokList }] = await Promise.all([
    kandidatQuery,
    admin.from("kelompok").select("id, nama").order("nama"),
  ]);

  const kandidat: KandidatRow[] = (
    (kandidatData ?? []) as unknown as Array<{
      id: string; nama: string; no_whatsapp: string | null;
      wa_status: string | null; wa_dikecualikan: boolean | null;
      wa_alasan_kecuali: string | null; kelompok: { nama: string } | null;
    }>
  ).map((r) => ({
    id: r.id,
    nama: r.nama,
    no_whatsapp: r.no_whatsapp ?? "",
    kelompok: r.kelompok?.nama ?? "-",
    wa_status: r.wa_status ?? "not_sent",
    wa_dikecualikan: Boolean(r.wa_dikecualikan),
    wa_alasan_kecuali: r.wa_alasan_kecuali,
    // Divalidasi di server supaya klien dan cron memakai aturan yang sama.
    nomor_valid: Boolean(normalizeWaNumber(r.no_whatsapp ?? "")),
  }));

  const kandidatTotal = kandidatCount ?? kandidat.length;
  const kandidatHalaman = Math.max(1, Math.ceil(kandidatTotal / A_PER));

  function hrefKandidat(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (sp.ak) params.set("ak", sp.ak);
    if (aStat !== "failed") params.set("astat", aStat);
    if (aq) params.set("aq", aq);
    params.set("ap", String(aPage));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    return `/wa-log?${params.toString()}`;
  }

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
          <p className="text-sm text-muted-foreground">Riwayat pengiriman notifikasi WhatsApp via API crm-wa (WhatsApp Business resmi).</p>
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

      {/* Antre ulang: pilih dulu, kirim belakangan. Tombolnya tidak pernah
          mengirim langsung — hanya mengembalikan baris ke antrean cron. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Antre ulang pengiriman</CardTitle>
          <CardDescription>
            Pilih setoran yang mau dikirimi ulang, lalu tekan Antrekan. Pengirimannya
            dilakukan cron secara bertahap — maksimal {kuota.batas} pesan per 24 jam.
            Peserta yang sudah berhasil terkirim, ditandai jangan-kirim, atau bernomor
            tidak valid tidak akan ikut terkirim meskipun tercentang.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Menunggu di antrean" value={String(pesertaAntre)} />
            <StatCard label="Gagal" value={String(pesertaGagal)} accent="text-red-600 dark:text-red-400" />
            <StatCard label="Dikecualikan" value={String(kecuali.total)} accent="text-muted-foreground" />
            <StatCard label="Sisa jatah 24 jam" value={`${kuota.sisa} / ${kuota.batas}`} accent="text-amber-600 dark:text-amber-400" />
          </div>

          {/* Pembersihan sekali jalan untuk data lama. Cron sebenarnya menemukan
              nomor rusak sendiri, tapi satu per satu dan lambat. */}
          <form action={tandaiNomorInvalidAction} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
            <p className="flex-1 text-xs text-muted-foreground">
              Nomor kosong, sepotong, atau berisi dua nomor sekaligus tidak akan pernah
              berhasil dikirim. Tandai sekaligus agar berhenti memenuhi daftar gagal.
              {kecuali.otomatis > 0 && ` Sudah ditandai sistem: ${kecuali.otomatis}.`}
            </p>
            <ConfirmButton
              type="submit"
              variant="outline"
              size="sm"
              message={
                "Periksa seluruh anggota dan tandai yang nomornya tidak valid?\n\n" +
                "Tidak ada pesan yang dikirim. Tandanya bisa dilepas lagi kapan saja."
              }
            >
              <ShieldOff /> Tandai nomor tidak valid
            </ConfirmButton>
          </form>

          {/* Filter pemilih. Terpisah dari filter tabel log di bawah. */}
          <form className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="aq" className="text-xs font-medium text-muted-foreground">Cari anggota</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="aq" name="aq" defaultValue={aq} placeholder="Nama / no HP" className="w-full pl-9 sm:w-56" />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="ak" className="text-xs font-medium text-muted-foreground">Kelompok</label>
              <Select id="ak" name="ak" defaultValue={sp.ak ?? "all"} className="w-full sm:w-44">
                <option value="all">Semua kelompok</option>
                {((kelompokList ?? []) as Array<{ id: string; nama: string }>).map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="astat" className="text-xs font-medium text-muted-foreground">Status WA</label>
              <Select id="astat" name="astat" defaultValue={aStat} className="w-full sm:w-44">
                <option value="failed">Gagal</option>
                <option value="pending">Menunggu antrean</option>
                <option value="not_sent">Belum dikirim</option>
                <option value="sent">Sudah terkirim</option>
                <option value="dikecualikan">Dikecualikan</option>
                <option value="all">Semua</option>
              </Select>
            </div>
            <input type="hidden" name="ap" value="1" />
            <Button type="submit" variant="outline" size="sm"><Search /> Terapkan</Button>
          </form>

          <PilihAntre rows={kandidat} batas={kuota.batas} />

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {kandidatTotal === 0
                ? "Tidak ada setoran yang cocok"
                : `Menampilkan ${(aPage - 1) * A_PER + 1}–${Math.min(aPage * A_PER, kandidatTotal)} dari ${kandidatTotal} setoran`}
            </span>
            {kandidatHalaman > 1 && (
              <div className="flex items-center gap-2">
                <Link
                  href={hrefKandidat({ ap: String(Math.max(1, aPage - 1)) })}
                  aria-disabled={aPage <= 1}
                  className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 ${aPage <= 1 ? "pointer-events-none opacity-50" : "hover:bg-accent"}`}
                >
                  <ChevronLeft className="h-4 w-4" /> Sebelumnya
                </Link>
                <span>Hal. {aPage} / {kandidatHalaman}</span>
                <Link
                  href={hrefKandidat({ ap: String(Math.min(kandidatHalaman, aPage + 1)) })}
                  aria-disabled={aPage >= kandidatHalaman}
                  className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 ${aPage >= kandidatHalaman ? "pointer-events-none opacity-50" : "hover:bg-accent"}`}
                >
                  Berikutnya <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filter & pencarian */}
      <form className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1 sm:flex-none">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Cari anggota</label>
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
                <TableHead>Detail / Respons API</TableHead>
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
              {rows.map((r) => {
                const orang = r.donasi?.anggota ?? r.peserta;
                const buku = r.donasi?.kelompok?.nama ?? r.peserta?.kelompok?.nama ?? "";
                return (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(r.sent_at)}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{orang?.nama ?? <span className="text-muted-foreground">(setoran dihapus)</span>}</div>
                    <div className="text-xs text-muted-foreground">{buku}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{orang?.no_whatsapp ?? "-"}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="max-w-md">
                    {r.error_message
                      ? <span className="text-xs text-red-600 dark:text-red-400">{r.error_message}</span>
                      : <span className="break-all font-mono text-xs text-muted-foreground">{summarizeResponse(r.fonnte_response)}</span>}
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
