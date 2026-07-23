"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface NomorUsahaRow {
  label: string;
  nomor: string;
  samaWa: boolean;
}

export function emptyNomorUsahaRow(): NomorUsahaRow {
  return { label: "", nomor: "", samaWa: false };
}

const LABEL_SUGGESTIONS = ["Kantor", "Sales", "Owner", "Toko"];

export function NomorUsahaEditor({
  noWhatsapp,
  rows,
  onChange,
}: {
  noWhatsapp: string;
  rows: NomorUsahaRow[];
  onChange: (rows: NomorUsahaRow[]) => void;
}) {
  function updateRow(i: number, patch: Partial<NomorUsahaRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, emptyNomorUsahaRow()]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div>
        <Label>Nomor Usaha (tampil publik di halaman Cari Usaha)</Label>
        <p className="text-xs text-muted-foreground">
          Nomor WA pribadi di atas tidak akan ditampilkan ke publik. Isi nomor kontak usaha di sini —
          boleh lebih dari satu (mis. telepon kantor, WA sales, HP owner). Centang &ldquo;Sama dengan No
          WA&rdquo; bila nomornya memang sama dengan WA pribadi di atas.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center">
              <Input
                list="nomor-usaha-label-suggestions"
                placeholder="Label (opsional): Kantor, Sales, Owner…"
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                className="sm:w-48"
              />
              <Input
                inputMode="tel"
                placeholder="08xxxxxxxxxx"
                value={row.samaWa ? noWhatsapp : row.nomor}
                disabled={row.samaWa}
                onChange={(e) => updateRow(i, { nomor: e.target.value })}
                className="flex-1"
              />
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={row.samaWa}
                  onChange={(e) => updateRow(i, { samaWa: e.target.checked })}
                  className="h-3.5 w-3.5"
                />
                Sama dengan No WA
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(i)}
                className="shrink-0 text-destructive hover:bg-destructive/10"
                aria-label="Hapus nomor ini"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <datalist id="nomor-usaha-label-suggestions">
        {LABEL_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3.5 w-3.5" /> Tambah Nomor
      </Button>

      <input type="hidden" name="nomor_usaha_json" value={JSON.stringify(rows)} />
    </div>
  );
}
