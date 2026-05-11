"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createKelompokAction, type CreateKelompokState } from "./actions";
import { parseRangeFields } from "@/lib/range-parser";

export function KelompokForm() {
  const [state, action, pending] = useActionState<CreateKelompokState, FormData>(
    createKelompokAction,
    undefined,
  );
  const [prefix, setPrefix] = useState("");
  const [startNo, setStartNo] = useState("");
  const [endNo, setEndNo] = useState("");

  const preview = useMemo(() => {
    if (!prefix.trim() && !startNo.trim() && !endNo.trim()) return null;
    try {
      const p = parseRangeFields(prefix, startNo, endNo);
      const s = String(p.start).padStart(p.padding, "0");
      const e = String(p.end).padStart(p.padding, "0");
      return { ok: true, msg: `Akan generate ${p.total} kupon: ${p.prefix}${s} – ${p.prefix}${e}.` };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : "Format tidak valid" };
    }
  }, [prefix, startNo, endNo]);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama Kelompok</Label>
          <Input id="nama" name="nama" placeholder="Kelompok A" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prefix">Prefix</Label>
          <Input
            id="prefix"
            name="prefix"
            placeholder="2026A"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="range_start">Nomor Awal</Label>
          <Input
            id="range_start"
            name="range_start"
            inputMode="numeric"
            placeholder="0001"
            value={startNo}
            onChange={(e) => setStartNo(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="range_end">Nomor Akhir</Label>
          <Input
            id="range_end"
            name="range_end"
            inputMode="numeric"
            placeholder="0500"
            value={endNo}
            onChange={(e) => setEndNo(e.target.value)}
            required
          />
        </div>
      </div>
      {preview && (
        <p className={`text-xs ${preview.ok ? "text-muted-foreground" : "text-destructive"}`}>{preview.msg}</p>
      )}
      {state?.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.success}</div>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {pending ? "Memproses..." : "Buat Kelompok & Generate Kupon"}
      </Button>
    </form>
  );
}
