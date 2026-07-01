import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/types/database";

// Di-cache per-request (React cache) supaya layout + page yang sama-sama
// memanggil requireProfile() hanya melakukan 1x getUser() + 1x query profiles,
// bukan 2x. Mengurangi round-trip auth/DB tiap navigasi.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return (data as Profile) ?? null;
});

export async function requireProfile(allowed?: Role[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (allowed && !allowed.includes(profile.role)) redirect("/dashboard");
  return profile;
}

/** Admin selalu boleh; petugas mengikuti flag izin per-user. */
export function canEditPeserta(p: Profile): boolean {
  return p.role === "admin" || p.can_edit_peserta === true;
}

export function canDeletePeserta(p: Profile): boolean {
  return p.role === "admin" || p.can_delete_peserta === true;
}
