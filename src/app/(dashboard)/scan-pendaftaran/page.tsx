import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

export default async function ScanPendaftaranPage() {
  await requireProfile(["admin", "petugas_pendaftaran"]);
  redirect("/peserta/tambah");
}
