"use client";

import { useRef, useState } from "react";
import { LogOut, Menu, Package, User } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar } from "./sidebar";
import type { Profile } from "@/types/database";

const ROLE_LABEL: Record<Profile["role"], string> = {
  admin: "Admin",
  petugas_pendaftaran: "Petugas Pendaftaran",
  petugas_distribusi: "Petugas Distribusi",
};

export function Header({ profile, kelompokNama, eventName }: { profile: Profile; kelompokNama?: string | null; eventName: string }) {
  const [open, setOpen] = useState(false);
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const initials = profile.nama.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex min-w-0 items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0">
            <div className="flex items-center gap-2 border-b p-4">
              <Package className="h-5 w-5 text-primary" />
              <p className="text-sm font-semibold leading-tight">{eventName}</p>
            </div>
            <Sidebar role={profile.role} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <Package className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">{eventName}</span>
        </div>
      </div>

      <form ref={logoutFormRef} action={logoutAction} className="hidden" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex shrink-0 items-center gap-2 rounded-full p-1 pr-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials || <User className="h-4 w-4" />}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight">{profile.nama}</span>
              <span className="block text-xs leading-tight text-muted-foreground">
                {ROLE_LABEL[profile.role]}{kelompokNama ? ` · ${kelompokNama}` : ""}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{profile.nama}</span>
              <span className="text-xs text-muted-foreground">
                {ROLE_LABEL[profile.role]}{kelompokNama ? ` · ${kelompokNama}` : ""}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              logoutFormRef.current?.requestSubmit();
            }}
            className="cursor-pointer"
          >
            <LogOut /> Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
