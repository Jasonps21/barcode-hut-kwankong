import type { MetadataRoute } from "next";
import { NAMA_APLIKASI } from "@/lib/app";

export default function manifest(): MetadataRoute.Manifest {
  const name = NAMA_APLIKASI;
  return {
    name,
    short_name: "Donatur Kwankong",
    description: `${name} — pencatatan donatur & kupon bingkisan`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
