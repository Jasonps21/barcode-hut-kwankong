import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ErrorListener } from "@/components/error-listener";

const eventName = process.env.NEXT_PUBLIC_EVENT_NAME ?? "Sistem Bingkisan";

export const metadata: Metadata = {
  title: { default: eventName, template: `%s · ${eventName}` },
  description: `Sistem barcode penerima bingkisan - ${eventName}`,
  applicationName: eventName,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: eventName,
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
