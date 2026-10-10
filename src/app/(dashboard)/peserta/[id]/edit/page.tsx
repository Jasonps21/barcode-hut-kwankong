import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tautan edit peserta lama (mis. tersimpan di bookmark) diarahkan ke anggota
 * hasil migrasinya, lewat tabel pemetaan `migrasi_peserta_anggota`.
 */
export default async function EditPesertaLamaPage(props: { params: Promise<{ id: string }> }) {
  await requireProfile(["admin", "petugas_pendaftaran"]);
  const { id } = await props.params;
  const admin = createAdminClient();

  const { data } = await admin
    .from("migrasi_peserta_anggota")
    .select("anggota_id")
    .eq("peserta_id", id)
    .maybeSingle();
  const anggotaId = (data as { anggota_id: string } | null)?.anggota_id;
  if (!anggotaId) notFound();
  redirect(`/anggota/${anggotaId}`);
}
