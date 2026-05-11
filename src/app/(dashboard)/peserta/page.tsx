import { ExternalLink, Filter, Send } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/utils";
import { buildWaMessage, normalizeWaNumber } from "@/lib/wa-template";
import { resendWaAction } from "./actions";

interface PesertaRow {
  id: string; nama: string; alamat: string;
  no_whatsapp: string; nominal_donasi: number | string;
  wa_status: string; wa_sent_at: string | null;
  kelompok_id: string; kelompok: { nama: string } | null;
}

function waBadge(status: string) {
  switch (status) {
    case "sent": return <Badge variant="success">Terkirim</Badge>;
    case "failed": return <Badge variant="destructive">Gagal</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    default: return <Badge variant="outline">Belum dikirim</Badge>;
  }
}

export default async function PesertaPage(props: { searchParams: Promise<{ kelompok?: string }> }) {
  const profile = await requireProfile(["admin", "petugas_pendaftaran"]);
  const sp = await props.searchParams;
  const supabase = await createClient();

  const kelompokFilter =
    profile.role === "admin"
      ? (sp.kelompok && sp.kelompok !== "all" ? sp.kelompok : null)
      : profile.kelompok_id;

  const query = supabase
    .from("peserta")
    .select("id, nama, alamat, no_whatsapp, nominal_donasi, wa_status, wa_sent_at, kelompok_id, kelompok(nama)")
    .order("created_at", { ascending: false });
  if (kelompokFilter) query.eq("kelompok_id", kelompokFilter);

  const [{ data: peserta }, { data: kelompokList }] = await Promise.all([
    query,
    supabase.from("kelompok").select("id, nama").order("nama"),
  ]);

  const rows = (peserta ?? []) as unknown as PesertaRow[];

  const pesertaIds = rows.map((r) => r.id);
  const { data: kuponData } = pesertaIds.length
    ? await supabase
        .from("kupon")
        .select("nomor_kupon, peserta_id")
        .in("peserta_id", pesertaIds)
        .order("nomor_kupon")
    : { data: [] };
  const kuponMap = new Map<string, string[]>();
  for (const k of (kuponData ?? []) as Array<{ nomor_kupon: string; peserta_id: string }>) {
    if (!kuponMap.has(k.peserta_id)) kuponMap.set(k.peserta_id, []);
    kuponMap.get(k.peserta_id)!.push(k.nomor_kupon);
  }

  function buildWaLink(p: PesertaRow): string | null {
    const target = normalizeWaNumber(p.no_whatsapp);
    if (!target) return null;
    const message = buildWaMessage({
      nama: p.nama, alamat: p.alamat,
      nominal_donasi: p.nominal_donasi,
      nomor_kupon_list: kuponMap.get(p.id) ?? [],
    });
    return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Peserta</h1>
          <p className="text-sm text-muted-foreground">Daftar peserta & status notifikasi WhatsApp.</p>
        </div>
        {profile.role === "admin" && (
          <form className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
            <div className="flex-1 space-y-1 sm:flex-none">
              <label htmlFor="kelompok" className="text-xs font-medium text-muted-foreground">Filter Kelompok</label>
              <Select id="kelompok" name="kelompok" defaultValue={sp.kelompok ?? "all"} className="w-full sm:w-44">
                <option value="all">Semua kelompok</option>
                {((kelompokList ?? []) as Array<{ id: string; nama: string }>).map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="outline" size="sm">
              <Filter /> Filter
            </Button>
          </form>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} Peserta</CardTitle>
          <CardDescription>
            <b>Kirim Ulang</b> = otomatis via Fonnte. <b>WA Manual</b> = buka WhatsApp dengan pesan siap kirim (fallback kalau Fonnte banned).
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
                <TableHead>Status WA</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Belum ada peserta.</TableCell>
                </TableRow>
              )}
              {rows.map((p) => {
                const waLink = buildWaLink(p);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.nama}</div>
                      <div className="text-xs text-muted-foreground">{p.alamat}</div>
                    </TableCell>
                    <TableCell>{p.kelompok?.nama ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.no_whatsapp}</TableCell>
                    <TableCell className="text-right">{formatRupiah(p.nominal_donasi)}</TableCell>
                    <TableCell>{waBadge(p.wa_status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <form action={resendWaAction}>
                          <input type="hidden" name="peserta_id" value={p.id} />
                          <Button type="submit" variant="outline" size="sm"><Send /> Kirim Ulang</Button>
                        </form>
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
    </div>
  );
}
