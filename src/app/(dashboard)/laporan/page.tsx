import { Banknote, Download, Ticket, Wallet } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/utils";
import { exportPesertaCsv, exportUangMasukCsv } from "./actions";

interface KelompokRow {
  id: string; nama: string; prefix: string;
  range_start: number; range_end: number; padding: number;
}

function fmtDateTime(iso: string | null): { tgl: string; jam: string } {
  if (!iso) return { tgl: "-", jam: "" };
  const d = new Date(iso);
  return { tgl: d.toLocaleDateString("id-ID"), jam: d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) };
}

export default async function LaporanPage(props: {
  searchParams: Promise<{ from?: string; to?: string; metode?: string }>;
}) {
  await requireProfile(["admin"]);
  const sp = await props.searchParams;
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const metode = sp.metode === "cash" || sp.metode === "transfer" ? sp.metode : "all";
  const fromISO = from ? `${from}T00:00:00` : null;
  const toISO = to ? `${to}T23:59:59.999` : null;

  const supabase = await createClient();
  const admin = createAdminClient();

  // ================= Per kelompok (ringkasan kupon & donasi) =================
  const { data: kelData } = await supabase
    .from("kelompok")
    .select("id, nama, prefix, range_start, range_end, padding")
    .order("nama");
  const kelompokRows = (kelData ?? []) as KelompokRow[];

  const stats = await Promise.all(kelompokRows.map(async (k) => {
    const [tot, asg, red, peserta] = await Promise.all([
      admin.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id),
      admin.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id).eq("status", "assigned"),
      admin.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id).eq("status", "redeemed"),
      admin.from("peserta").select("nominal_donasi").eq("kelompok_id", k.id),
    ]);
    const totalDonasi = ((peserta.data ?? []) as { nominal_donasi: number | string }[])
      .reduce((acc, p) => acc + Number(p.nominal_donasi ?? 0), 0);
    return { ...k, total: tot.count ?? 0, assigned: asg.count ?? 0, redeemed: red.count ?? 0, donasi: totalDonasi, peserta: peserta.data?.length ?? 0 };
  }));
  const grand = stats.reduce(
    (a, s) => ({ total: a.total + s.total, assigned: a.assigned + s.assigned, redeemed: a.redeemed + s.redeemed, donasi: a.donasi + s.donasi, peserta: a.peserta + s.peserta }),
    { total: 0, assigned: 0, redeemed: 0, donasi: 0, peserta: 0 },
  );

  // ================= Rekap uang masuk (registrasi) =================
  let mq = admin
    .from("peserta")
    .select("id, nama, nominal_donasi, metode_bayar, registered_at, created_by, kelompok(nama)")
    .not("registered_at", "is", null)
    .order("registered_at", { ascending: false });
  if (fromISO) mq = mq.gte("registered_at", fromISO);
  if (toISO) mq = mq.lte("registered_at", toISO);
  if (metode !== "all") mq = mq.eq("metode_bayar", metode);
  const { data: regData } = await mq;
  const regs = (regData ?? []) as unknown as Array<{
    id: string; nama: string; nominal_donasi: number | string; metode_bayar: string | null;
    registered_at: string | null; created_by: string | null; kelompok: { nama: string } | null;
  }>;
  let totalCash = 0, totalTransfer = 0;
  for (const r of regs) {
    const n = Number(r.nominal_donasi ?? 0);
    if (r.metode_bayar === "transfer") totalTransfer += n; else if (r.metode_bayar === "cash") totalCash += n;
  }
  const totalUang = totalCash + totalTransfer;

  // ================= Kupon keluar per hari =================
  let kq = admin
    .from("kupon")
    .select("nomor_kupon, assigned_at, assigned_by, status, peserta(nama, kelompok(nama))")
    .not("assigned_at", "is", null)
    .order("assigned_at", { ascending: false });
  if (fromISO) kq = kq.gte("assigned_at", fromISO);
  if (toISO) kq = kq.lte("assigned_at", toISO);
  const { data: kuponData } = await kq;
  const kupons = (kuponData ?? []) as unknown as Array<{
    nomor_kupon: string; assigned_at: string | null; assigned_by: string | null; status: string;
    peserta: { nama: string; kelompok: { nama: string } | null } | null;
  }>;

  // nama petugas untuk created_by + assigned_by
  const userIds = [...new Set([
    ...regs.map((r) => r.created_by),
    ...kupons.map((k) => k.assigned_by),
  ].filter(Boolean))] as string[];
  const petugasMap = new Map<string, string>();
  if (userIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, nama").in("id", userIds);
    for (const p of (profs ?? []) as Array<{ id: string; nama: string }>) petugasMap.set(p.id, p.nama);
  }

  // grup kupon per tanggal
  const perHari = new Map<string, number>();
  for (const k of kupons) {
    const key = k.assigned_at ? new Date(k.assigned_at).toLocaleDateString("id-ID") : "-";
    perHari.set(key, (perHari.get(key) ?? 0) + 1);
  }
  const perHariRows = [...perHari.entries()];

  const DETAIL_LIMIT = 300;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Laporan</h1>
          <p className="text-sm text-muted-foreground">Rekap uang masuk, kupon keluar, dan statistik per kelompok.</p>
        </div>
        <form action={exportPesertaCsv}>
          <Button type="submit" variant="outline"><Download /> Export Semua Peserta</Button>
        </form>
      </div>

      {/* ---------- Filter ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Periode</CardTitle>
          <CardDescription>Pilih rentang tanggal & metode bayar. Kosongkan tanggal untuk semua waktu.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="from" className="text-xs font-medium text-muted-foreground">Dari tanggal</label>
              <Input id="from" name="from" type="date" defaultValue={from} className="w-44" />
            </div>
            <div className="space-y-1">
              <label htmlFor="to" className="text-xs font-medium text-muted-foreground">Sampai tanggal</label>
              <Input id="to" name="to" type="date" defaultValue={to} className="w-44" />
            </div>
            <div className="space-y-1">
              <label htmlFor="metode" className="text-xs font-medium text-muted-foreground">Metode bayar</label>
              <Select id="metode" name="metode" defaultValue={metode} className="w-40">
                <option value="all">Semua</option>
                <option value="cash">Cash</option>
                <option value="transfer">Transfer</option>
              </Select>
            </div>
            <Button type="submit" variant="default" size="sm">Terapkan</Button>
            <a href="/laporan" className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:underline">Reset</a>
          </form>
        </CardContent>
      </Card>

      {/* ---------- Rekap uang masuk ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Banknote className="h-5 w-5" />} label="Total Cash" value={formatRupiah(totalCash)} accent="emerald" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Total Transfer" value={formatRupiah(totalTransfer)} accent="sky" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Total Keseluruhan" value={formatRupiah(totalUang)} accent="violet" />
        <StatCard icon={<Ticket className="h-5 w-5" />} label="Jumlah Registrasi" value={String(regs.length)} accent="amber" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Rekap Uang Masuk</CardTitle>
            <CardDescription>
              Registrasi {metode !== "all" ? `(${metode})` : ""}{from || to ? ` ${from || "…"} s/d ${to || "…"}` : " (semua waktu)"}.
            </CardDescription>
          </div>
          <form action={exportUangMasukCsv}>
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <input type="hidden" name="metode" value={metode} />
            <Button type="submit" variant="outline" size="sm"><Download /> Export CSV</Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead>Petugas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Belum ada registrasi pada periode ini.</TableCell></TableRow>
              )}
              {regs.slice(0, DETAIL_LIMIT).map((r) => {
                const { tgl, jam } = fmtDateTime(r.registered_at);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">{tgl} <span className="text-muted-foreground">{jam}</span></TableCell>
                    <TableCell className="font-medium">{r.nama}</TableCell>
                    <TableCell>{r.kelompok?.nama ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={r.metode_bayar === "transfer" ? "secondary" : "outline"} className="capitalize">{r.metode_bayar ?? "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(r.nominal_donasi)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.created_by ? petugasMap.get(r.created_by) ?? "-" : "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {regs.length > DETAIL_LIMIT && (
            <p className="border-t p-3 text-center text-xs text-muted-foreground">
              Menampilkan {DETAIL_LIMIT} dari {regs.length} baris. Gunakan Export CSV untuk data lengkap.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- Kupon keluar per hari ---------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kupon Keluar per Hari</CardTitle>
            <CardDescription>Jumlah kupon yang di-assign per tanggal (total {kupons.length}).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Tanggal</TableHead><TableHead className="text-right">Jumlah Kupon</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {perHariRows.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="py-10 text-center text-muted-foreground">Belum ada kupon keluar pada periode ini.</TableCell></TableRow>
                )}
                {perHariRows.map(([tgl, jml]) => (
                  <TableRow key={tgl}>
                    <TableCell>{tgl}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{jml}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detail Pengambilan Kupon</CardTitle>
            <CardDescription>Siapa yang mendapat kupon & petugas yang meng-assign.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kupon</TableHead>
                  <TableHead>Peserta</TableHead>
                  <TableHead>Petugas</TableHead>
                  <TableHead>Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kupons.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Belum ada data.</TableCell></TableRow>
                )}
                {kupons.slice(0, DETAIL_LIMIT).map((k) => {
                  const { tgl, jam } = fmtDateTime(k.assigned_at);
                  return (
                    <TableRow key={k.nomor_kupon}>
                      <TableCell className="font-mono text-xs">{k.nomor_kupon}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{k.peserta?.nama ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{k.peserta?.kelompok?.nama ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{k.assigned_by ? petugasMap.get(k.assigned_by) ?? "-" : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{tgl} {jam}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {kupons.length > DETAIL_LIMIT && (
              <p className="border-t p-3 text-center text-xs text-muted-foreground">Menampilkan {DETAIL_LIMIT} dari {kupons.length} baris.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Per kelompok (existing) ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Per Kelompok</CardTitle>
          <CardDescription>Distribusi kupon, peserta, dan donasi (akumulasi, tanpa filter tanggal).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kelompok</TableHead>
                <TableHead>Range</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Diasosiasikan</TableHead>
                <TableHead className="text-right">Ditukar</TableHead>
                <TableHead className="text-right">Peserta</TableHead>
                <TableHead className="text-right">Total Donasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((s) => {
                const start = String(s.range_start).padStart(s.padding, "0");
                const end = String(s.range_end).padStart(s.padding, "0");
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nama}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{s.prefix}{start}–{s.prefix}{end}</Badge></TableCell>
                    <TableCell className="text-right">{s.total}</TableCell>
                    <TableCell className="text-right">{s.assigned}</TableCell>
                    <TableCell className="text-right">{s.redeemed}</TableCell>
                    <TableCell className="text-right">{s.peserta}</TableCell>
                    <TableCell className="text-right">{formatRupiah(s.donasi)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={2}>TOTAL</TableCell>
                <TableCell className="text-right">{grand.total}</TableCell>
                <TableCell className="text-right">{grand.assigned}</TableCell>
                <TableCell className="text-right">{grand.redeemed}</TableCell>
                <TableCell className="text-right">{grand.peserta}</TableCell>
                <TableCell className="text-right">{formatRupiah(grand.donasi)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string;
  accent: "emerald" | "sky" | "violet" | "amber";
}) {
  const accents: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    sky: "text-sky-600 dark:text-sky-400",
    violet: "text-violet-600 dark:text-violet-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={accents[accent]}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
