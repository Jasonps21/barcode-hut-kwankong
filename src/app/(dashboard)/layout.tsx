import { Package } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const eventName = process.env.NEXT_PUBLIC_EVENT_NAME ?? "Sistem Bingkisan";

  let kelompokNama: string | null = null;
  if (profile.kelompok_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("kelompok")
      .select("nama")
      .eq("id", profile.kelompok_id)
      .single();
    kelompokNama = (data as { nama: string } | null)?.nama ?? null;
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r bg-background md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Package className="h-5 w-5 text-primary" />
          <p className="text-sm font-semibold leading-tight truncate">{eventName}</p>
        </div>
        <Sidebar role={profile.role} />
      </aside>
      <div className="flex flex-1 flex-col">
        <Header profile={profile} kelompokNama={kelompokNama} eventName={eventName} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
