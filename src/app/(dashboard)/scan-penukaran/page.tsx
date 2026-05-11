import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanPenukaranClient } from "./scan-client";

export default async function ScanPenukaranPage() {
  await requireProfile(["admin", "petugas_distribusi"]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scan Penukaran</h1>
        <p className="text-sm text-muted-foreground">Scan QR kupon peserta untuk konfirmasi pengambilan bingkisan.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Scanner QR</CardTitle>
          <CardDescription>Arahkan kamera ke kupon, atau ketik nomor manual.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScanPenukaranClient />
        </CardContent>
      </Card>
    </div>
  );
}
