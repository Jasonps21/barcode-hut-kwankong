import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ErrorListener } from "@/components/error-listener";
import { NAMA_APLIKASI } from "@/lib/app";


export const metadata: Metadata = {
  title: { default: NAMA_APLIKASI, template: `%s · ${NAMA_APLIKASI}` },
  description: `${NAMA_APLIKASI} — pencatatan donatur & kupon bingkisan`,
  applicationName: NAMA_APLIKASI,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: NAMA_APLIKASI,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <ErrorListener />
        {children}
      </body>
    </html>
  );
}
