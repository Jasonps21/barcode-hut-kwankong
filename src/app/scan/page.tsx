import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasScanAccess } from "@/lib/scan-auth";
import { PinGate } from "./pin-form";
import { ScanPenukaranClient } from "./scan-client";

export default async function ScanPenukaranPage() {
  const unlocked = await hasScanAccess();
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scan Penukaran</h1>
        <p className="text-sm text-muted-foreground">Scan QR kupon peserta untuk konfirmasi pengambilan bingkisan.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{unlocked ? "Scanner QR" : "Akses Terkunci"}</CardTitle>
          <CardDescription>
            {unlocked ? "Arahkan kamera ke kupon, atau ketik nomor manual." : "Masukkan PIN untuk mulai scan."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unlocked ? <ScanPenukaranClient /> : <PinGate />}
        </CardContent>
      </Card>
    </div>
  );
}
