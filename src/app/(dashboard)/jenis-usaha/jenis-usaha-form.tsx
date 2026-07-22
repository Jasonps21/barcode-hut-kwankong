"use client";

import { useActionState, useRef, useEffect } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createJenisUsahaAction, type CreateJenisUsahaState } from "./actions";

export function JenisUsahaForm() {
  const [state, action, pending] = useActionState<CreateJenisUsahaState, FormData>(
    createJenisUsahaAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 space-y-2 sm:flex-none">
        <Label htmlFor="nama">Nama Jenis Usaha</Label>
        <Input id="nama" name="nama" placeholder="Furniture" className="w-full sm:w-64" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        {pending ? "Menyimpan..." : "Tambah"}
      </Button>
      {state?.error && (
        <div className="w-full rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</div>
      )}
      {state?.success && (
        <div className="w-full rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {state.success}
        </div>
      )}
    </form>
  );
}
