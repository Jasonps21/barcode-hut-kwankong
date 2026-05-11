import { Download } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/utils";
import { exportPesertaCsv } from "./actions";

interface Row {
  id: string; nama: string; prefix: string;
  range_start: number; range_end: number; padding: number;
}

export default async function LaporanPage() {
  await requireProfile(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("kelompok")
    .select("id, nama, prefix, range_start, range_end, padding")
    .order("nama");

  const rows = (data ?? []) as Row[];

  const stats = await Promise.all(rows.map(async (k) => {
    const sb = await createClient();
    const [tot, asg, red, peserta] = await Promise.all([
      sb.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id),
      sb.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id).eq("status", "assigned"),
      sb.from("kupon").select("id", { count: "exact", head: true }).eq("kelompok_id", k.id).eq("status", "redeemed"),
      sb.from("peserta").select("nominal_donasi").eq("kelompok_id", k.id),
    ]);
    const totalDonasi = ((peserta.data ?? []) as { nominal_donasi: number | string }[])
      .reduce((acc, p) => acc + Number(p.nominal_donasi ?? 0), 0);
    return {
      ...k, total: tot.count ?? 0, assigned: asg.count ?? 0,
      redeemed: red.count ?? 0, donasi: totalDonasi,
      peserta: peserta.data?.length ?? 0,
    };
  }));

  const grand = stats.reduce(
    (a, s) => ({
      total: a.total + s.total, assigned: a.assigned + s.assigned,
      redeemed: a.redeemed + s.redeemed, donasi: a.donasi + s.donasi,
      peserta: a.peserta + s.peserta,
    }),
    { total: 0, assigned: 0, redeemed: 0, donasi: 0, peserta: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Laporan</h1>
          <p className="text-sm text-muted-foreground">Statistik per kelompok dan total keseluruhan.</p>
        </div>
        <form action={exportPesertaCsv}>
          <Button type="submit" variant="outline"><Download /> Export CSV Peserta</Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per Kelompok</CardTitle>
          <CardDescription>Distribusi kupon, peserta, dan donasi.</CardDescription>
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
