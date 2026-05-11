"use client";

import { useCallback, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, Camera, CameraOff, CheckCircle2, Loader2, RotateCcw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { lookupKupon, redeemKupon, type LookupResult } from "./actions";

export function ScanPenukaranClient() {
  const [scanOn, setScanOn] = useState(true);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [manual, setManual] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmMsg, setConfirmMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doLookup = useCallback((nomor: string) => {
    if (!nomor) return;
    setConfirmMsg(null);
    startTransition(async () => {
      const r = await lookupKupon(nomor);
      setResult(r);
    });
  }, []);

  function reset() {
    setResult(null);
    setConfirmMsg(null);
    setScanOn(true);
  }

  function confirm() {
    if (!result?.kupon_id) return;
    startTransition(async () => {
      const r = await redeemKupon(result.kupon_id!);
      if (r.ok) {
        setConfirmMsg({ ok: true, text: `${result.nomor_kupon} berhasil ditukar.` });
        setResult(null);
      } else {
        setConfirmMsg({ ok: false, text: r.error ?? "Gagal." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={scanOn ? "destructive" : "default"} size="sm" onClick={() => setScanOn((v) => !v)}>
          {scanOn ? <><CameraOff /> Tutup Scanner</> : <><Camera /> Buka Scanner</>}
        </Button>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Input
            className="flex-1 sm:w-44"
            placeholder="Manual: 2026A0001"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(manual); setManual(""); } }}
          />
          <Button variant="outline" onClick={() => { doLookup(manual); setManual(""); }}>
            <Search /> Cek
          </Button>
        </div>
      </div>

      {scanOn && !result && (
        <QrScanner active={scanOn} onDetect={(t) => { setScanOn(false); doLookup(t); }} />
      )}

      {pending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memproses...
        </div>
      )}

      {confirmMsg && (
        <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${confirmMsg.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
          {confirmMsg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {confirmMsg.text}
        </div>
      )}

      {result && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-2xl font-bold">{result.nomor_kupon}</p>
            <Button variant="ghost" size="sm" onClick={reset}><RotateCcw /> Scan lain</Button>
          </div>

          {result.status === "not_found" && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
              <XCircle className="h-5 w-5" /> Kupon tidak terdaftar di sistem.
            </div>
          )}
          {result.status === "wrong_group" && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
              <ArrowRight className="h-5 w-5" />
              <div>
                <p className="font-medium">Kupon ini milik kelompok <b>{result.kelompok_nama ?? "-"}</b>.</p>
                <p className="text-sm">Arahkan peserta ke konter kelompok tersebut.</p>
              </div>
            </div>
          )}
          {result.status === "not_assigned" && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" /> Kupon belum diasosiasikan ke peserta manapun.
            </div>
          )}
          {result.status === "already_redeemed" && (
            <div className="mt-4 space-y-1 rounded-md bg-destructive/10 p-3 text-destructive">
              <div className="flex items-center gap-2 font-medium"><XCircle className="h-5 w-5" /> Kupon sudah ditukar.</div>
              {result.peserta && <p className="text-sm">Peserta: <b>{result.peserta.nama}</b></p>}
              {result.redeemed_at && (
                <p className="text-sm">Pada: {new Date(result.redeemed_at).toLocaleString("id-ID")}</p>
              )}
            </div>
          )}
          {result.status === "ok" && result.peserta && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Nama</dt><dd className="font-medium">{result.peserta.nama}</dd></div>
                  <div><dt className="text-muted-foreground">Kelompok</dt><dd className="font-medium">{result.kelompok_nama ?? "-"}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Alamat</dt><dd>{result.peserta.alamat}</dd></div>
                  <div><dt className="text-muted-foreground">No WhatsApp</dt><dd className="font-mono">{result.peserta.no_whatsapp}</dd></div>
                </dl>
              </div>
              <Button onClick={confirm} disabled={pending} size="lg" className="w-full">
                <CheckCircle2 /> Konfirmasi Pengambilan
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
