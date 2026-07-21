"use client";

import { useActionState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateScanPinAction, type UpdateScanPinState } from "./actions";

export function ScanPinForm({ currentPin }: { currentPin: string | null }) {
  const [state, action, pending] = useActionState<UpdateScanPinState, FormData>(updateScanPinAction, undefined);

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        PIN saat ini: <span className="font-mono font-semibold text-foreground">{currentPin ?? "belum diset"}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="pin"
          placeholder="PIN baru (min 4 karakter)"
          minLength={4}
          required
          className="w-48"
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Simpan PIN
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.success}</p>}
    </form>
  );
}
