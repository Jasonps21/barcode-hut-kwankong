"use client";

import { useState } from "react";
import { Input } from "./input";
import { terbilang } from "@/lib/terbilang";

interface RupiahInputProps {
  name: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  /** batas jumlah digit (default 12 = sampai ratusan miliar) */
  maxDigits?: number;
}

/**
 * Input nominal rupiah dengan pemisah ribuan otomatis saat mengetik dan
 * baris "terbilang" agar pengguna (terutama lansia) tidak salah jumlah 0.
 * Yang dikirim ke server adalah angka digit murni lewat <input hidden>.
 */
export function RupiahInput({ name, id, required, placeholder, defaultValue, maxDigits = 12 }: RupiahInputProps) {
  const [raw, setRaw] = useState(() => String(defaultValue ?? "").replace(/\D/g, ""));

  const num = raw ? Number(raw) : 0;
  const display = raw ? num.toLocaleString("id-ID") : "";

  return (
    <div className="space-y-1">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
          Rp
        </span>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          value={display}
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, maxDigits))}
          className="pl-9 text-right text-base font-medium tabular-nums"
        />
      </div>
      <input type="hidden" name={name} value={raw} />
      {num > 0 && (
        <p className="text-xs capitalize text-muted-foreground">
          {terbilang(num)} rupiah
        </p>
      )}
    </div>
  );
}
