import { BadgeCheck, BanknoteArrowUp, CreditCard, HandCoins, MessageCircle, MessageCircleOff, MessageCircleWarning, PackageCheck, Ticket, TrendingUp, Trophy, Users, Wallet } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah, dateKeyWITA } from "@/lib/utils";
import { sumNominalDonasi } from "@/lib/donasi-sum";

interface Stats {
  total_kupon: number;
  assigned: number;
  redeemed: number;
  total_donasi: number;
  total_peserta: number;
  peserta_donasi: number;
  wa_sent: number;
  wa_failed: number;
  wa_pending: number;
}

async function loadStats(kelompokId: string | null): Promise<Stats> {
  const supabase = await createClient();

  // Hitung via COUNT di server (head: true) — tidak menarik seluruh baris.
  const kuponCount = (status?: string) => {
    let q = supabase.from("kupon").select("id", { count: "exact", head: true });
    if (kelompokId) q = q.eq("kelompok_id", kelompokId);
    if (status) q = q.eq("status", status);
    return q;
  };
  const pesertaCount = (waStatus?: string) => {
    let q = supabase.from("peserta").select("id", { count: "exact", head: true });
    if (kelompokId) q = q.eq("kelompok_id", kelompokId);
    if (waStatus) q = q.eq("wa_status", waStatus);
    return q;
  };
  // Peserta "sudah ikut donasi" = sudah selesai registrasi (registered_at terisi),
  // beda dengan sekadar data yang diimpor tapi belum daftar/bayar.
  const pesertaDonasiCount = (() => {
    let q = supabase.from("peserta").select("id", { count: "exact", head: true }).not("registered_at", "is", null);
    if (kelompokId) q = q.eq("kelompok_id", kelompokId);
    return q;
  })();
  // total_donasi butuh SUM semua baris (bukan hanya 1000 pertama): pakai
  // helper yang menjumlahkan seluruh baris secara paginasi.
  const makeDonasiQuery = () => {
    let q = supabase.from("peserta").select("nominal_donasi");
    if (kelompokId) q = q.eq("kelompok_id", kelompokId);
    return q;
  };

  const [
    totalKupon, assigned, redeemed,
    totalPeserta, pesertaDonasi, waSent, waFailed,
    total_donasi,
  ] = await Promise.all([
    kuponCount(), kuponCount("assigned"), kuponCount("redeemed"),
    pesertaCount(), pesertaDonasiCount, pesertaCount("sent"), pesertaCount("failed"),
    sumNominalDonasi(makeDonasiQuery),
  ]);

  const total_peserta = totalPeserta.count ?? 0;
  const wa_sent = waSent.count ?? 0;
  const wa_failed = waFailed.count ?? 0;

  return {
    total_kupon: totalKupon.count ?? 0,
    assigned: assigned.count ?? 0,
    redeemed: redeemed.count ?? 0,
    total_donasi,
    total_peserta,
    peserta_donasi: pesertaDonasi.count ?? 0,
    wa_sent,
    wa_failed,
    wa_pending: Math.max(0, total_peserta - wa_sent - wa_failed),
  };
}

interface KelompokDonasi { id: string; nama: string; total: number; peserta: number }
interface TopDonatur { nama: string; kelompok: string; nominal: number }
interface TrenHari { key: string; label: string; count: number; total: number }
interface Analytics {
  perKelompok: KelompokDonasi[];
  metode: { cash: { total: number; count: number }; transfer: { total: number; count: number } };
  topDonatur: TopDonatur[];
  tren: TrenHari[];
}

// Analitik lintas kelompok — hanya untuk admin. Satu kali pindai seluruh
// peserta terdaftar (paginasi 1000/baris, seperti sumNominalDonasi) lalu
// diagregasi di server: total donasi & jumlah peserta per kelompok, breakdown
// metode bayar, dan tren pendaftaran 14 hari terakhir (WITA).
async function loadAnalytics(): Promise<Analytics> {
  const supabase = await createClient();

  const { data: kelompokData } = await supabase
    .from("kelompok")
    .select("id, nama")
    .order("created_at", { ascending: true });
  const kelompokList = (kelompokData ?? []) as Array<{ id: string; nama: string }>;
  const kelompokNama = new Map(kelompokList.map((k) => [k.id, k.nama]));

  const perKelompokMap = new Map<string, { total: number; peserta: number }>();
  const metode = { cash: { total: 0, count: 0 }, transfer: { total: 0, count: 0 } };
  const dailyCount = new Map<string, number>();
  const dailyTotal = new Map<string, number>();

  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("peserta")
      .select("kelompok_id, nominal_donasi, metode_bayar, registered_at")
      .not("registered_at", "is", null)
      .gt("nominal_donasi", 0)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ kelompok_id: string; nominal_donasi: number | string; metode_bayar: string | null; registered_at: string | null }>) {
      const nominal = Number(r.nominal_donasi ?? 0);
      const pk = perKelompokMap.get(r.kelompok_id) ?? { total: 0, peserta: 0 };
      pk.total += nominal;
      pk.peserta += 1;
      perKelompokMap.set(r.kelompok_id, pk);
      if (r.metode_bayar === "cash") { metode.cash.total += nominal; metode.cash.count += 1; }
      else if (r.metode_bayar === "transfer") { metode.transfer.total += nominal; metode.transfer.count += 1; }
      const dk = dateKeyWITA(r.registered_at);
      dailyCount.set(dk, (dailyCount.get(dk) ?? 0) + 1);
      dailyTotal.set(dk, (dailyTotal.get(dk) ?? 0) + nominal);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const perKelompok: KelompokDonasi[] = kelompokList
    .map((k) => ({ id: k.id, nama: k.nama, total: perKelompokMap.get(k.id)?.total ?? 0, peserta: perKelompokMap.get(k.id)?.peserta ?? 0 }))
    .sort((a, b) => b.total - a.total);

  // Penyumbang tertinggi — query terpisah (order + limit) supaya presisi & murah.
  const { data: topData } = await supabase
    .from("peserta")
    .select("nama, kelompok_id, nominal_donasi")
    .not("registered_at", "is", null)
    .gt("nominal_donasi", 0)
    .order("nominal_donasi", { ascending: false })
    .limit(10);
  const topDonatur: TopDonatur[] = ((topData ?? []) as Array<{ nama: string; kelompok_id: string; nominal_donasi: number | string }>).map((r) => ({
    nama: r.nama,
    kelompok: kelompokNama.get(r.kelompok_id) ?? "-",
    nominal: Number(r.nominal_donasi ?? 0),
  }));

  // Tren 14 hari terakhir (termasuk hari kosong) berdasarkan tanggal WITA.
  const tren: TrenHari[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = dateKeyWITA(d.toISOString());
    const label = d.toLocaleDateString("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short" });
    tren.push({ key, label, count: dailyCount.get(key) ?? 0, total: dailyTotal.get(key) ?? 0 });
  }

  return { perKelompok, metode, topDonatur, tren };
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}

function StatCard({ label, value, hint, icon: Icon, accent = "text-primary" }: StatProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${accent}`} />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Grafik batang horizontal (magnitude, satu hue) — tiap baris berlabel nilai
// sehingga identitas & besaran tak pernah bergantung pada warna saja.
function DonasiKelompokChart({ rows }: { rows: KelompokDonasi[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-blue-500" /> Total Dana per Kelompok</CardTitle>
        <CardDescription>Jumlah donasi & peserta yang sudah ikut, per kelompok.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data donasi.</p>}
        {rows.map((r) => (
          <div key={r.id} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{r.nama}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatRupiah(r.total)} <span className="text-xs">· {r.peserta} peserta</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TopDonaturCard({ rows }: { rows: TopDonatur[] }) {
  const medal = ["text-amber-500", "text-slate-400", "text-orange-600"];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> Penyumbang Tertinggi</CardTitle>
        <CardDescription>10 donasi terbesar dari peserta terdaftar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data donasi.</p>}
        {rows.map((r, i) => (
          <div key={`${r.nama}-${i}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
            <span className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${medal[i] ?? "text-muted-foreground"}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.nama}</div>
              <div className="truncate text-xs text-muted-foreground">{r.kelompok}</div>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatRupiah(r.nominal)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MetodeBayarCard({ metode }: { metode: Analytics["metode"] }) {
  const total = metode.cash.total + metode.transfer.total;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const transferPct = pct(metode.transfer.total);
  const cashPct = pct(metode.cash.total);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-500" /> Metode Pembayaran</CardTitle>
        <CardDescription>Proporsi nominal donasi berdasarkan cara bayar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-blue-500" style={{ width: `${transferPct}%` }} title={`Transfer ${transferPct}%`} />
          <div className="h-full bg-emerald-500" style={{ width: `${cashPct}%` }} title={`Cash ${cashPct}%`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Transfer</div>
            <p className="mt-1 text-lg font-bold tabular-nums">{formatRupiah(metode.transfer.total)}</p>
            <p className="text-xs text-muted-foreground">{metode.transfer.count} transaksi · {transferPct}%</p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Cash</div>
            <p className="mt-1 text-lg font-bold tabular-nums">{formatRupiah(metode.cash.total)}</p>
            <p className="text-xs text-muted-foreground">{metode.cash.count} transaksi · {cashPct}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrenPendaftaranCard({ rows }: { rows: TrenHari[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const totalPeserta = rows.reduce((s, r) => s + r.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-violet-500" /> Tren Pendaftaran (14 Hari Terakhir)</CardTitle>
        <CardDescription>{totalPeserta} pendaftaran dalam 14 hari terakhir.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-44 items-end gap-1.5 sm:gap-2">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-1 flex-col items-center gap-1" title={`${r.label}: ${r.count} pendaftaran · ${formatRupiah(r.total)}`}>
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{r.count || ""}</span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-violet-500"
                  style={{ height: `${r.count ? Math.max(4, (r.count / max) * 100) : 0}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">{r.label.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const isAdmin = profile.role === "admin";
  const [stats, analytics] = await Promise.all([
    loadStats(isAdmin ? null : profile.kelompok_id),
    isAdmin ? loadAnalytics() : Promise.resolve(null),
  ]);

  const pct = (n: number) => stats.total_kupon ? ` (${Math.round((n / stats.total_kupon) * 100)}%)` : "";
  const pesertaDonasiPct = stats.total_peserta ? Math.round((stats.peserta_donasi / stats.total_peserta) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {profile.role === "admin" ? "Statistik seluruh kelompok." : "Statistik kelompok Anda."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Kupon" value={String(stats.total_kupon)} icon={Ticket} />
        <StatCard label="Diasosiasikan" value={String(stats.assigned)} hint={`dari ${stats.total_kupon}${pct(stats.assigned)}`} icon={BadgeCheck} accent="text-blue-500" />
        <StatCard label="Sudah Ditukar" value={String(stats.redeemed)} hint={`dari ${stats.total_kupon}${pct(stats.redeemed)}`} icon={PackageCheck} accent="text-emerald-500" />
        <StatCard label="Total Peserta" value={String(stats.total_peserta)} icon={Users} accent="text-violet-500" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Sudah Ikut Donasi"
          value={`${stats.peserta_donasi} (${pesertaDonasiPct}%)`}
          hint={`dari ${stats.total_peserta} total peserta di aplikasi`}
          icon={HandCoins}
          accent="text-amber-600"
        />
        <StatCard label="Total Donasi" value={formatRupiah(stats.total_donasi)} icon={BanknoteArrowUp} accent="text-emerald-600" />
        <StatCard label="WA Terkirim" value={String(stats.wa_sent)} icon={MessageCircle} accent="text-emerald-500" />
        <StatCard label="WA Gagal" value={String(stats.wa_failed)} icon={MessageCircleWarning} accent="text-rose-500" />
        <StatCard label="WA Pending" value={String(stats.wa_pending)} icon={MessageCircleOff} accent="text-amber-500" />
      </div>

      {analytics && (
        <>
          <div className="pt-2">
            <h2 className="text-xl font-semibold tracking-tight">Analisa Data</h2>
            <p className="text-sm text-muted-foreground">Ringkasan grafis dari seluruh donasi yang terkumpul.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DonasiKelompokChart rows={analytics.perKelompok} />
            <TopDonaturCard rows={analytics.topDonatur} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <MetodeBayarCard metode={analytics.metode} />
            <TrenPendaftaranCard rows={analytics.tren} />
          </div>
        </>
      )}
    </div>
  );
}
