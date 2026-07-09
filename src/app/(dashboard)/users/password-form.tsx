"use client";

import { useActionState, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUserPasswordAction, type UpdatePasswordState } from "./actions";

interface Props { userId: string; userLabel: string }

export function PasswordForm({ userId, userLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UpdatePasswordState, FormData>(updateUserPasswordAction, undefined);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound /> Ubah Password
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex items-center gap-1.5">
        <Input
          name="password"
          type="password"
          placeholder="min 6 karakter"
          minLength={6}
          required
          className="h-8 w-40 text-xs"
          aria-label={`Password baru untuk ${userLabel}`}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : "Simpan"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
      {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
      {state?.success && <span className="text-xs text-emerald-600 dark:text-emerald-400">{state.success}</span>}
    </form>
  );
}
