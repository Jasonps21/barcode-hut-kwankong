import { CalendarDays, Ticket, UserCheck, Wallet } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateKeyWITA, formatRupiah, formatTanggalJamWITA, formatTanggalWITA } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { hanyaDonasiTerhitung } from "@/lib/donasi-sum";
import { ambilSemuaBaris } from "@/lib/query-semua";
import { pilihKegiatan } from "@/lib/kegiatan";

interface PesertaRow {
  id: string; nama: string | null; nominal_donasi: number | string;
  registered_at: string | null; created_at: string;
  kelompok: { nama: string } | null;
}
interface KuponRow { nomor_kupon: string; donasi_id: string | null; assigned_at: string | null }

function dateKey(iso: string | null): string {
  return formatTanggalWITA(iso, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null): string {
  return formatTanggalJamWITA(iso);
}

export default async function LaporanSayaPage(props: {
  searchParams: Promise<{ kegiatan?: string; from?: string; to?: string }>;
}) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const sp = await props.searchParams;
  const { kegiatan, semua: semuaKegiatan } = await pilihKegiatan(sp.kegiatan);
  const kegiatanId = kegiatan?.id ?? null;
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const fromISO = from ? `${from}T00:00:00` : null;
  const toISO = to ? `${to}T23:59:59.999` : null;

  const admin = createAdminClient();

  // Setoran yang SAYA catat
  const makePesertaQuery = () => {
    let pq = hanyaDonasiTerhitung(
      admin
        .from("donasi_lengkap")
        .select("id, nama, nominal_donasi, registered_at, created_at, kelompok:kelompok_id(nama)")
        .eq("created_by", profile.id)
        .order("registered_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true }),
      kegiatanId,
    );
    if (fromISO) pq = pq.gte("registered_at", fromISO);
    if (toISO) pq = pq.lte("registered_at", toISO);
    return pq;
  };
  const peserta = await ambilSemuaBaris<PesertaRow>(makePesertaQuery as never);

  // Kupon yang SAYA berikan
  const makeKuponQuery = () => {
    let kq = admin
      .from("kupon")
      .select("nomor_kupon, donasi_id, assigned_at")
      .eq("assigned_by", profile.id)
      .order("assigned_at", { ascending: false })
      .order("nomor_kupon", { ascending: true });
    if (kegiatanId) kq = kq.eq("kegiatan_id", kegiatanId);
    if (fromISO) kq = kq.gte("assigned_at", fromISO);
    if (toISO) kq = kq.lte("assigned_at", toISO);
    return kq;
  };
  const kupons = await ambilSemuaBaris<KuponRow>(makeKuponQuery as never);

  // Map donasi_id -> daftar nomor kupon (untuk detail aktivitas)
  const kuponByPeserta = new Map<string, string[]>();
  for (const k of kupons) {
    if (!k.donasi_id) continue;
    const arr = kuponByPeserta.get(k.donasi_id) ?? [];
    arr.push(k.nomor_kupon);
    kuponByPeserta.set(k.donasi_id, arr);
  }

  const totalDonasi = peserta.reduce((a, p) => a + Number(p.nominal_donasi ?? 0), 0);

  // ---- Rekap harian: gabungkan jumlah peserta & kupon per tanggal ----
  const harian = new Map<string, { tgl: string; ts: number; peserta: number; kupon: number }>();
  function bump(iso: string | null, field: "peserta" | "kupon") {
    const key = dateKey(iso);
    const ts = iso ? new Date(dateKeyWITA(iso)).getTime() : 0;
    const cur = harian.get(key) ?? { tgl: key, ts, peserta: 0, kupon: 0 };
    cur[field] += 1;
    harian.set(key, cur);
  }
  for (const p of peserta) bump(p.registered_at ?? p.created_at, "peserta");
  for (const k of kupons) bump(k.assigned_at, "kupon");
  const harianRows = [...harian.values()].sort((a, b) => b.ts - a.ts);

  const DETAIL_LIMIT = 300;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Laporan Saya</h1>
        <p className="text-sm text-muted-foreground">
          Rekap input Anda sendiri{kegiatan ? ` di ${kegiatan.nama}` : ""}: setoran yang dicatat & kupon yang diberikan{profile.role === "admin" ? " (sebagai akun ini)" : ""}.
        </p>
      </div>

      {/* Filter periode */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="kegiatan" className="text-xs font-medium text-muted-foreground">Kegiatan</label>
          <Select id="kegiatan" name="kegiatan" defaultValue={kegiatanId ?? ""} className="w-56">
            {semuaKegiatan.map((k) => (
              <option key={k.id} value={k.id}>{k.nama}{k.aktif ? " (berjalan)" : ""}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">Dari tanggal</label>
          <Input id="from" name="from" type="date" defaultValue={from} className="w-44" />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">Sampai tanggal</label>
          <Input id="to" name="to" type="date" defaultValue={to} className="w-44" />
        </div>
        <Button type="submit" variant="default" size="sm">Terapkan</Button>
        <a href="/laporan-saya" className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:underline">Reset</a>
      </form>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<UserCheck className="h-5 w-5" />} label="Setoran Dicatat" value={String(peserta.length)} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={<Ticket className="h-5 w-5" />} label="Kupon Diberikan" value={String(kupons.length)} accent="text-sky-600 dark:text-sky-400" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Total Donasi Masuk" value={formatRupiah(totalDonasi)} accent="text-violet-600 dark:text-violet-400" />
      </div>

      {/* Rekap harian */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Rekap Harian</CardTitle>
          <CardDescription>Jumlah setoran & kupon yang Anda input per tanggal.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Setoran</TableHead>
                <TableHead className="text-right">Kupon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {harianRows.length === 0 && (
                <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">Belum ada input pada periode ini.</TableCell></TableRow>
              )}
              {harianRows.map((r) => (
                <TableRow key={r.tgl}>
                  <TableCell>{r.tgl}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{r.peserta}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{r.kupon}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Aktivitas detail */}
      <Card>
        <CardHeader>
          <CardTitle>Aktivitas Saya</CardTitle>
          <CardDescription>Setoran yang Anda catat beserta kupon yang Anda berikan.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Anggota</TableHead>
                <TableHead>Kupon</TableHead>
                <TableHead className="text-right">Donasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {peserta.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Belum ada setoran yang Anda catat.</TableCell></TableRow>
              )}
              {peserta.slice(0, DETAIL_LIMIT).map((p) => {
                const ks = kuponByPeserta.get(p.id) ?? [];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(p.registered_at ?? p.created_at)}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{p.nama}</div>
                      <div className="text-xs text-muted-foreground">{p.kelompok?.nama ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      {ks.length === 0 ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {ks.map((n) => <Badge key={n} variant="outline" className="font-mono text-[10px]">{n}</Badge>)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatRupiah(p.nominal_donasi)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {peserta.length > DETAIL_LIMIT && (
            <p className="border-t p-3 text-center text-xs text-muted-foreground">Menampilkan {DETAIL_LIMIT} dari {peserta.length} baris.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={accent}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
