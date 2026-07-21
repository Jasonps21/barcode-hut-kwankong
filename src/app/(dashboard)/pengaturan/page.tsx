import { requireProfile } from "@/lib/auth";
import { getScanPin } from "@/lib/scan-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanPinForm } from "./scan-pin-form";

export default async function PengaturanPage() {
  await requireProfile(["admin"]);
  const currentPin = await getScanPin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Konfigurasi aplikasi yang bisa diubah admin.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>PIN Halaman Scan Publik</CardTitle>
          <CardDescription>
            PIN ini dipakai relawan untuk membuka halaman <code>/scan</code> tanpa perlu login. Bagikan PIN secara
            terpisah dari link halamannya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScanPinForm currentPin={currentPin} />
        </CardContent>
      </Card>
    </div>
  );
}
