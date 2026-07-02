"use client";

import { Ticket } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export function KuponDetailModal({ nama, kupon }: { nama: string; kupon: string[] }) {
  if (kupon.length === 0) {
    return <span className="text-xs text-muted-foreground">Tanpa kupon</span>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
        >
          <Ticket className="h-3.5 w-3.5" /> {kupon.length} kupon
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kupon {nama}</DialogTitle>
          <DialogDescription>{kupon.length} nomor kupon yang diambil peserta ini.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {kupon.map((nomor) => (
            <Badge key={nomor} variant="outline" className="font-mono text-xs">{nomor}</Badge>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
