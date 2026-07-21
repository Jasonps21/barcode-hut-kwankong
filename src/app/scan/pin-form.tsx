"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockScan } from "./pin-actions";

export function PinGate() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!pin) return;
    setError(null);
    startTransition(async () => {
      const r = await unlockScan(pin);
      if (r.ok) {
        router.refresh();
      } else {
        setError(r.error ?? "PIN salah.");
        setPin("");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Masukkan PIN akses untuk membuka scanner.</p>
      <div className="flex w-full max-w-xs gap-2">
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <Button onClick={submit} disabled={pending || !pin}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buka"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
