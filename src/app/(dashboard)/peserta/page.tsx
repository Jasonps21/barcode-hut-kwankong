import { redirect } from "next/navigation";

/** Halaman Peserta lama digantikan Anggota; tautan lama tetap diarahkan ke sana. */
export default function PesertaLamaPage() {
  redirect("/anggota");
}
