import { BadgeCheck, BanknoteArrowUp, MessageCircle, MessageCircleOff, MessageCircleWarning, PackageCheck, Ticket, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah } from "@/lib/utils";

interface Stats {
  total_kupon: number;
  assigned: number;
  redeemed: number;
  total_donasi: number;
  total_peserta: number;
  wa_sent: number;
  wa_failed: number;
  wa_pending: number;
}

async function loadStats(kelompokId: string | null): Promise<Stats> {
  const supabase = await createClient();
  const kuponQ = supabase.from("kupon").select("status");
  const pesertaQ = supabase.from("peserta").select("nominal_donasi, wa_status");
  if (kelompokId) {
    kuponQ.eq("kelompok_id", kelompokId);
    pesertaQ.eq("kelompok_id", kelompokId);
  }
  const [{ data: kupon }, { data: peserta }] = await Promise.all([kuponQ, pesertaQ]);
  const stats: Stats = {
    total_kupon: kupon?.length ?? 0, assigned: 0, redeemed: 0,
    total_donasi: 0, total_peserta: peserta?.length ?? 0,
    wa_sent: 0, wa_failed: 0, wa_pending: 0,
  };
  for (const k of (kupon ?? []) as { status: string }[]) {
    if (k.status === "assigned") stats.assigned++;
    else if (k.status === "redeemed") stats.redeemed++;
  }
  for (const p of (peserta ?? []) as { nominal_donasi: number | string; wa_status: string }[]) {
    stats.total_donasi += Number(p.nominal_donasi ?? 0);
    if (p.wa_status === "sent") stats.wa_sent++;
    else if (p.wa_status === "failed") stats.wa_failed++;
    else stats.wa_pending++;
  }
  return stats;
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Donasi" value={formatRupiah(stats.total_donasi)} icon={BanknoteArrowUp} accent="text-emerald-600" />
        <StatCard label="WA Terkirim" value={String(stats.wa_sent)} icon={MessageCircle} accent="text-emerald-500" />
        <StatCard label="WA Gagal" value={String(stats.wa_failed)} icon={MessageCircleWarning} accent="text-rose-500" />
        <StatCard label="WA Pending" value={String(stats.wa_pending)} icon={MessageCircleOff} accent="text-amber-500" />
      </div>
    </div>
  );
}
