import type { NextConfig } from "next";

/** Domain terowongan (ngrok) untuk menguji /scan dari HP sungguhan. Kamera hanya
 *  bisa diakses di origin aman, sedangkan http://<ip-lan>:3000 tidak memenuhi
 *  syarat itu — jadi scanner tidak akan pernah menyala lewat LAN biasa. */
const DOMAIN_TEROWONGAN = ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.io", "*.ngrok.app"];

/** Hanya dibuka saat `next dev`. Berbeda dengan allowedDevOrigins yang memang
 *  hanya berlaku di mode dev, serverActions.allowedOrigins ikut terpakai di
 *  produksi — membiarkannya terbuka di sana sama dengan memperlebar permukaan
 *  CSRF untuk selamanya demi sesi uji yang cuma sekali.
 *
 *  Di produksi nilainya `undefined`, bukan array kosong: itu mengembalikan
 *  perilaku bawaan Next (hanya origin yang sama) persis seperti sebelum opsi
 *  ini ada, tanpa bergantung pada tafsir Next terhadap daftar kosong. */
const asalServerAction = process.env.NODE_ENV === "development" ? DOMAIN_TEROWONGAN : undefined;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Foto bukti transfer bisa > 1MB (default limit server action).
      bodySizeLimit: "8mb",
      allowedOrigins: asalServerAction,
    },
  },
  allowedDevOrigins: [
    ...DOMAIN_TEROWONGAN,
    "192.168.150.56",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
};

export default nextConfig;
