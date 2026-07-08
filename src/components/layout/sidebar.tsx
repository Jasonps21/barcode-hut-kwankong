"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, UserPlus, ScanLine, ScanBarcode, FileBarChart, Layers, UserCog, MessageSquare, ClipboardList, ReceiptText, AlertTriangle, History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/database";

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: Role[] }

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "petugas_pendaftaran", "petugas_distribusi"] },
  { href: "/kelompok", label: "Kelompok", icon: Layers, roles: ["admin"] },
  { href: "/peserta", label: "Peserta", icon: Users, roles: ["admin", "petugas_pendaftaran"] },
  { href: "/peserta/tambah", label: "Tambah Peserta", icon: UserPlus, roles: ["admin", "petugas_pendaftaran"] },
  { href: "/transaksi", label: "Transaksi", icon: ReceiptText, roles: ["admin", "petugas_pendaftaran"] },
  { href: "/scan-pendaftaran", label: "Scan Pendaftaran", icon: ScanLine, roles: ["admin", "petugas_pendaftaran"] },
  { href: "/laporan-saya", label: "Laporan Saya", icon: ClipboardList, roles: ["admin", "petugas_pendaftaran"] },
  { href: "/scan-penukaran", label: "Scan Penukaran", icon: ScanBarcode, roles: ["admin", "petugas_distribusi"] },
  { href: "/wa-log", label: "Log WhatsApp", icon: MessageSquare, roles: ["admin"] },
  { href: "/log-error", label: "Log Error", icon: AlertTriangle, roles: ["admin"] },
  { href: "/log-aktivitas", label: "Log Aktivitas", icon: History, roles: ["admin"] },
  { href: "/laporan", label: "Laporan", icon: FileBarChart, roles: ["admin"] },
  { href: "/users", label: "Pengguna", icon: UserCog, roles: ["admin"] },
];

export function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => i.roles.includes(role));
  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
