import { redirect } from "next/navigation";

/** Form Tambah Peserta lama digantikan Tambah Anggota. */
export default function TambahPesertaLamaPage() {
  redirect("/anggota/tambah");
}
