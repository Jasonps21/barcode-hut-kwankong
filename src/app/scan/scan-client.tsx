"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { AlertTriangle, ArrowRight, Camera, CameraOff, CheckCircle2, Loader2, RotateCcw, Search, Volume2, VolumeX, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { formatTanggalJamWITA } from "@/lib/utils";
import {
  bacaSetelanBunyi,
  bunyikan,
  langgananSetelanBunyi,
  setelanBunyiAwal,
  simpanSetelanBunyi,
  type JenisBunyi,
} from "@/lib/bunyi-scan";
import { batalkanRedeem, lookupKupon, redeemKupons, type KuponRingkas, type LookupResult } from "./actions";

/** Lama tombol "Batalkan" tersedia setelah penukaran. Harus lebih pendek dari
 *  batas di server (2 menit) supaya tombolnya tidak pernah menjanjikan sesuatu
 *  yang akan ditolak server. */
const DETIK_BATAL = 30;

/** Mulai dari jumlah ini, penukaran minta konfirmasi kedua. Yang jumlahnya besar
 *  paling mahal kalau salah, dan justru paling sulit dicek sekilas. */
const AMBANG_KONFIRMASI = 5;

/** Dari mana nomor kupon datang. Scan QR dibaca langsung dari kupon fisik, jadi
 *  boleh dipercaya lebih jauh daripada ketikan tangan yang bisa salah digit. */
type Sumber = "qr" | "manual";

interface Sukses {
  nama: string;
  berhasil: KuponRingkas[];
  gagal: { nomor_kupon: string; alasan: string }[];
  /** True bila ditukar tanpa petugas menekan tombol, supaya panel sukses bisa
   *  menjelaskan apa yang barusan terjadi dengan sendirinya. */
  otomatis: boolean;
}

export function ScanPenukaranClient() {
  const [scanOn, setScanOn] = useState(true);
  const [hasil, setHasil] = useState<LookupResult | null>(null);
  /** id kupon yang akan ditukar, urut sesuai urutan scan. */
  const [dipilih, setDipilih] = useState<string[]>([]);
  /** Bagian dari `dipilih` yang dicentang dengan jari, bukan hasil scan QR.
   *  Dipisah supaya bisa ditandai jelas sebelum panitia menekan konfirmasi. */
  const [manual, setManual] = useState<string[]>([]);
  const [ketik, setKetik] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [sukses, setSukses] = useState<Sukses | null>(null);
  const [sisaDetik, setSisaDetik] = useState(0);
  const [tanyaKonfirmasi, setTanyaKonfirmasi] = useState(false);
  const [pending, startTransition] = useTransition();

  /** Hanya untuk menggambar tombolnya. Keputusan bunyi/bisu saat penukaran
   *  dibaca langsung dari store (lihat `bunyi` di bawah), bukan dari nilai ini. */
  const bunyiNyala = useSyncExternalStore(langgananSetelanBunyi, bacaSetelanBunyi, setelanBunyiAwal);

  /** Dipakai sebagai key panel hasil supaya tiap penukaran baru memicu ulang
   *  animasi kilat, termasuk saat dua peserta berturut-turut sama-sama 1 kupon
   *  dan isinya nyaris tak berbeda. */
  const [kilat, setKilat] = useState(0);

  // Sengaja membaca store, bukan variabel di atas: `tangkap` dipasang ke scanner
  // yang menyimpan handler-nya sendiri, dan `tukar` berjalan di dalam transition
  // async — keduanya bisa memegang closure lama dengan nilai yang sudah basi.
  function bunyi(jenis: JenisBunyi) {
    if (bacaSetelanBunyi()) bunyikan(jenis);
  }

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (sisaDetik <= 0) return;
    const t = setTimeout(() => setSisaDetik((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [sisaDetik]);

  const nomorTerpilih = useMemo(
    () => dipilih.map((id) => hasil?.sisa?.find((k) => k.id === id)?.nomor_kupon ?? "?"),
    [dipilih, hasil],
  );

  function reset() {
    setHasil(null);
    setDipilih([]);
    setManual([]);
    setFlash(null);
    setSukses(null);
    setSisaDetik(0);
    setScanOn(true);
  }

  /** Inti penukaran, dipakai baik oleh tombol Konfirmasi maupun auto-tukar. */
  async function tukar(ids: string[], nama: string, otomatis: boolean) {
    const r = await redeemKupons(ids);
    if (r.error) {
      bunyi("gagal");
      setFlash({ ok: false, text: r.error });
      return;
    }
    bunyi(r.berhasil.length > 0 ? "berhasil" : "gagal");
    setSukses({ nama, berhasil: r.berhasil, gagal: r.gagal, otomatis });
    setSisaDetik(r.berhasil.length ? DETIK_BATAL : 0);
    setKilat((n) => n + 1);
    setHasil(null);
    setDipilih([]);
    setManual([]);
    setFlash(null);
  }

  function lookup(nomor: string, sumber: Sumber) {
    startTransition(async () => {
      const r = await lookupKupon(nomor);

      // Peserta yang tinggal punya satu kupon tidak punya apa pun untuk
      // dicocokkan: QR-nya baru saja dibaca dari kupon fisik itu sendiri, dan
      // tidak ada jumlah yang perlu dihitung. Menahan mereka di layar konfirmasi
      // hanya menambah dua ketukan per orang — mahal saat antrian panjang,
      // padahal tidak menambah keamanan. Yang bawa banyak kupon tetap lewat
      // daftar centang, karena di situ justru hitungannya yang rawan.
      if (sumber === "qr" && r.status === "ok" && r.kupon_id && r.sisa?.length === 1) {
        await tukar([r.kupon_id], r.peserta?.nama ?? "-", true);
        return;
      }

      // Kupon tidak terdaftar, sudah ditukar, salah kelompok, atau belum
      // diasosiasikan — semuanya menuntut petugas berhenti dan melihat layar.
      if (r.status !== "ok") bunyi("gagal");

      setHasil(r);
      setManual([]);
      setKilat((n) => n + 1);
      // Kupon yang barusan discan langsung tercentang; sisanya menunggu discan
      // masing-masing, sehingga kupon yang tidak dibawa tidak ikut tertukar.
      setDipilih(r.status === "ok" && r.kupon_id ? [r.kupon_id] : []);
    });
  }

  /** Satu pintu untuk QR maupun ketik manual, supaya keduanya berperilaku sama. */
  function tangkap(teks: string, sumber: Sumber) {
    const nomor = teks.trim().toUpperCase();
    if (!nomor) return;

    // Kupon yang barusan ditukar biasanya masih tergeletak di depan kamera dan
    // terbaca ulang tiap 1,5 detik. Mengabaikannya menjaga panel sukses berikut
    // tombol "Batalkan" tetap utuh, alih-alih tergantikan peringatan "sudah
    // ditukar" yang justru menghilangkan jalan keluar dari salah scan.
    if (sukses?.berhasil.some((k) => k.nomor_kupon === nomor)) return;

    setSukses(null);
    setSisaDetik(0);

    if (!hasil?.peserta) {
      lookup(nomor, sumber);
      return;
    }

    const target = hasil.sisa?.find((k) => k.nomor_kupon === nomor);
    if (target) {
      if (dipilih.includes(target.id)) {
        setFlash({ ok: true, text: `${nomor} sudah dicentang.` });
        return;
      }
      bunyi("berhasil");
      setDipilih((p) => [...p, target.id]);
      setManual((m) => m.filter((id) => id !== target.id));
      setFlash({ ok: true, text: `${nomor} ditambahkan.` });
      return;
    }

    // Kupon ini bukan milik peserta yang sedang di layar (atau sudah ditukar).
    // Jangan diam-diam berpindah peserta selama masih ada centangan yang belum
    // dikonfirmasi — itu menghapus hasil kerja panitia tanpa jejak.
    if (dipilih.length > 0) {
      bunyi("gagal");
      setFlash({
        ok: false,
        text: `${nomor} bukan milik ${hasil.peserta.nama}. Konfirmasi dulu ${dipilih.length} kupon, atau tekan "Ganti peserta".`,
      });
      return;
    }
    lookup(nomor, sumber);
  }

  function toggle(k: KuponRingkas) {
    const sudah = dipilih.includes(k.id);
    setDipilih(sudah ? dipilih.filter((id) => id !== k.id) : [...dipilih, k.id]);
    setManual(sudah ? manual.filter((id) => id !== k.id) : [...manual, k.id]);
  }

  function mintaKonfirmasi() {
    if (!dipilih.length) return;
    if (dipilih.length >= AMBANG_KONFIRMASI || manual.length > 0) {
      setTanyaKonfirmasi(true);
      return;
    }
    jalankanRedeem();
  }

  function jalankanRedeem() {
    setTanyaKonfirmasi(false);
    const nama = hasil?.peserta?.nama ?? "-";
    const ids = dipilih;
    startTransition(async () => {
      await tukar(ids, nama, false);
    });
  }

  function batalkan() {
    if (!sukses?.berhasil.length) return;
    const ids = sukses.berhasil.map((k) => k.id);
    startTransition(async () => {
      const r = await batalkanRedeem(ids);
      if (r.ok) {
        bunyi("berhasil");
        setSukses(null);
        setSisaDetik(0);
        setFlash({ ok: true, text: `${r.jumlah} kupon dikembalikan. Silakan scan ulang.` });
      } else {
        // Paling sering: "sudah lewat batas waktu pembatalan". Petugas mengira
        // kupon sudah kembali dan meneruskan antrian, padahal harus ke admin.
        bunyi("gagal");
        setFlash({ ok: false, text: r.error ?? "Gagal membatalkan." });
      }
    });
  }

  const sisa = hasil?.sisa ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={scanOn ? "destructive" : "default"} size="sm" onClick={() => setScanOn((v) => !v)}>
          {scanOn ? <><CameraOff /> Tutup Scanner</> : <><Camera /> Buka Scanner</>}
        </Button>
        {hasil?.peserta && (
          <Button variant="outline" size="sm" onClick={reset}><RotateCcw /> Ganti peserta</Button>
        )}
        <Button
          variant="outline"
          size="sm"
          title={bunyiNyala ? "Bunyi menyala — tekan untuk membisukan" : "Bunyi bisu — tekan untuk menyalakan"}
          onClick={() => {
            const baru = !bunyiNyala;
            simpanSetelanBunyi(baru);
            // Bunyikan contoh saat dinyalakan: sekalian membuka izin audio
            // browser lewat ketukan ini, supaya bunyi pertama nanti tidak
            // tertelan status "suspended".
            if (baru) bunyikan("berhasil");
          }}
        >
          {bunyiNyala ? <Volume2 /> : <VolumeX />}
          {bunyiNyala ? "Bunyi" : "Bisu"}
        </Button>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Input
            className="flex-1 sm:w-44"
            placeholder="Manual: 2026A0001"
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tangkap(ketik, "manual"); setKetik(""); } }}
          />
          <Button variant="outline" onClick={() => { tangkap(ketik, "manual"); setKetik(""); }}>
            <Search /> Cek
          </Button>
        </div>
      </div>

      {/* Scanner sengaja tetap menyala di semua keadaan — termasuk di layar
          sukses. Itulah inti multi-scan (menembak kupon berikutnya tanpa ganti
          layar) sekaligus yang membuat peserta 1-kupon jadi nol ketukan:
          petugas cukup scan orang berikutnya, layar berganti sendiri.
          Membiarkannya tetap ter-mount juga menghindari kamera stop-start
          tiap penukaran, yang bikin jeda satu-dua detik di tiap peserta. */}
      {scanOn && <QrScanner active onDetect={(t) => tangkap(t, "qr")} />}

      {pending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memproses...
        </div>
      )}

      {flash && (
        <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${flash.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
          {flash.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {flash.text}
        </div>
      )}

      {sukses && (
        <div key={kilat} className="kilat-hasil space-y-3 rounded-xl border bg-card p-5">
          {/* Nol berhasil bukan kabar baik: itu berarti seluruhnya kalah dari
              konter lain. Jangan disajikan hijau seolah penukaran sukses —
              dengan auto-tukar petugas tidak lagi menatap layar tiap transaksi,
              jadi warnanya yang harus memanggil perhatian. */}
          {sukses.berhasil.length > 0 ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              {sukses.berhasil.length} kupon ditukar
              {sukses.otomatis && " · otomatis, ini kupon terakhirnya"}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <XCircle className="h-5 w-5 shrink-0" />
              Tidak ada kupon yang ditukar
            </div>
          )}

          {/* Nama peserta dijadikan yang terbesar: inilah satu-satunya hal di
              panel ini yang perlu dicocokkan petugas dengan orang di depannya.
              Sebelumnya hanya keterangan abu-abu kecil di bawah jumlah kupon. */}
          <p className="text-2xl font-bold leading-tight">{sukses.nama}</p>

          <div className="flex flex-wrap gap-1.5">
            {sukses.berhasil.map((k) => (
              <span key={k.id} className="rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                {k.nomor_kupon}
              </span>
            ))}
          </div>

          {sukses.gagal.length > 0 && (
            <div className="space-y-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Tidak bisa ditukar:</p>
              {sukses.gagal.map((g, i) => (
                <p key={i}><span className="font-mono">{g.nomor_kupon}</span> — {g.alasan}</p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {sisaDetik > 0 && (
              <Button variant="outline" size="sm" onClick={batalkan} disabled={pending}>
                <RotateCcw /> Batalkan ({sisaDetik}s)
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={reset}><Camera /> Bersihkan layar</Button>
          </div>

          {/* Petugas perlu tahu bahwa tidak ada tombol yang wajib ditekan di
              sini — kalau tidak, mereka akan tetap mencari-cari tombolnya. */}
          {scanOn && (
            <p className="text-xs text-muted-foreground">
              Scanner masih aktif — langsung scan kupon peserta berikutnya, layar akan berganti sendiri.
            </p>
          )}
        </div>
      )}

      {hasil && !sukses && (
        <div key={kilat} className="kilat-hasil space-y-4 rounded-xl border bg-card p-5">
          {!hasil.peserta ? (
            <>
              <p className="font-mono text-2xl font-bold">{hasil.nomor_kupon}</p>
              {hasil.status === "not_found" && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
                  <XCircle className="h-5 w-5 shrink-0" /> Kupon tidak terdaftar di sistem.
                </div>
              )}
              {hasil.status === "not_assigned" && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5 shrink-0" /> Kupon belum diasosiasikan ke peserta manapun.
                </div>
              )}
              {hasil.status === "already_redeemed" && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
                  <XCircle className="h-5 w-5 shrink-0" /> Kupon sudah ditukar
                  {hasil.redeemed_at && <> pada {formatTanggalJamWITA(hasil.redeemed_at)}</>}.
                </div>
              )}
              {hasil.status === "wrong_group" && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
                  <ArrowRight className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Kupon ini milik kelompok <b>{hasil.kelompok_nama ?? "-"}</b>.</p>
                    <p className="text-sm">Arahkan peserta ke konter kelompok tersebut.</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-xl font-bold">{hasil.peserta.nama}</p>
                <p className="text-sm text-muted-foreground">
                  {hasil.kelompok_nama ?? "-"} · {hasil.peserta.alamat}
                </p>
                <p className="font-mono text-sm text-muted-foreground">{hasil.peserta.no_whatsapp}</p>
              </div>

              {hasil.status === "already_redeemed" && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <XCircle className="h-5 w-5 shrink-0" />
                  <span>
                    Kupon <b className="font-mono">{hasil.nomor_kupon}</b> sudah ditukar
                    {hasil.redeemed_at && <> pada {formatTanggalJamWITA(hasil.redeemed_at)}</>}.
                    {sisa.length > 0 && " Kupon lain di bawah masih bisa ditukar."}
                  </span>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                {hasil.sudah_ditukar} dari {hasil.total_kupon} kupon sudah ditukar.
              </p>

              {sisa.length > 0 ? (
                <>
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      Belum ditukar ({sisa.length}) — scan tiap kupon fisik untuk mencentang
                    </p>
                    <ul className="divide-y overflow-hidden rounded-lg border">
                      {sisa.map((k) => {
                        const aktif = dipilih.includes(k.id);
                        return (
                          <li key={k.id}>
                            <button
                              type="button"
                              onClick={() => toggle(k)}
                              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${aktif ? "bg-emerald-500/10" : "hover:bg-muted/50"}`}
                            >
                              {aktif
                                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                : <span className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/40" />}
                              <span className="font-mono text-base">{k.nomor_kupon}</span>
                              {manual.includes(k.id) && (
                                <span className="ml-auto rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                                  manual
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <Button onClick={mintaKonfirmasi} disabled={pending || dipilih.length === 0} size="lg" className="w-full">
                    <CheckCircle2 />
                    {dipilih.length === 0 ? "Scan kupon untuk mulai" : `Konfirmasi ${dipilih.length} Kupon`}
                  </Button>
                </>
              ) : (
                <p className="rounded-md bg-muted p-3 text-sm">Semua kupon peserta ini sudah ditukar.</p>
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={tanyaKonfirmasi} onOpenChange={setTanyaKonfirmasi}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tukar {dipilih.length} kupon?</DialogTitle>
            <DialogDescription>
              Atas nama <b>{hasil?.peserta?.nama ?? "-"}</b>. Cocokkan jumlahnya dengan kupon fisik di tangan Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {nomorTerpilih.map((n) => (
              <span key={n} className="rounded bg-muted px-2 py-1 font-mono text-xs">{n}</span>
            ))}
          </div>

          {manual.length > 0 && (
            <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              {manual.length} kupon dicentang manual tanpa scan QR. Pastikan kupon fisiknya benar-benar ada.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setTanyaKonfirmasi(false)}>Batal</Button>
            <Button className="flex-1" onClick={jalankanRedeem} disabled={pending}>Ya, tukar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
