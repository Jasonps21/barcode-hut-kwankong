import { BadgeCheck, BanknoteArrowUp, HandCoins, MessageCircle, MessageCircleOff, MessageCircleWarning, PackageCheck, Ticket, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/utils";
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

export default async function DashboardPage() {
  const profile = await requireProfile();
  const stats = await loadStats(profile.role === "admin" ? null : profile.kelompok_id);

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
    </div>
  );
}
