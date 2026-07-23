import { Archivo_Black, IBM_Plex_Mono, Inter } from "next/font/google";
import { Search, MapPin, Phone, Store, LogIn } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWaNumber } from "@/lib/wa-template";
import "./cari-usaha.css";

const display = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Cari Usaha",
  description: "Direktori usaha & merk warga — cari lalu hubungi langsung lewat WhatsApp.",
};

interface NomorUsahaRow {
  label: string | null;
  nomor: string;
}

interface HasilRow {
  id: string;
  nama: string;
  alamat: string;
  kota_kabupaten: string | null;
  provinsi: string | null;
  keterangan: string | null;
  jenis_usaha: { nama: string } | null;
  peserta_nomor_usaha: NomorUsahaRow[];
}

const TITLE = "CARI USAHA";

const STOPWORDS = new Set([
  "di", "ke", "dari", "dan", "yang", "untuk", "atau",
  "kota", "kab", "kabupaten", "kec", "kecamatan", "provinsi", "prov", "daerah", "wilayah",
]);

function tokenize(input: string): string[] {
  const words = input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  return meaningful.length ? meaningful : words;
}

export default async function CariUsahaPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim();
  const admin = createAdminClient();

  const { data: kategoriData } = await admin.from("jenis_usaha").select("nama").order("nama");
  const kategori = (kategoriData ?? []).map((k) => k.nama as string);

  let rows: HasilRow[] = [];
  if (q) {
    const tokens = tokenize(q);

    let query = admin
      .from("peserta")
      .select(
        "id, nama, alamat, kota_kabupaten, provinsi, keterangan, jenis_usaha(nama), peserta_nomor_usaha(label, nomor)",
      )
      .not("jenis_usaha_id", "is", null);

    // Setiap kata harus cocok di suatu tempat (AND antar kata, OR antar kolom per kata) —
    // supaya "furniture makassar" menemukan yang jenis usahanya Furniture DAN lokasinya Makassar.
    for (const token of tokens) {
      const like = `%${token}%`;
      const { data: jenisUsahaMatch } = await admin.from("jenis_usaha").select("id").ilike("nama", like);
      const jenisUsahaIds = (jenisUsahaMatch ?? []).map((j) => j.id as string);

      const orParts = [
        `keterangan.ilike.${like}`,
        `nama.ilike.${like}`,
        `alamat.ilike.${like}`,
        `kota_kabupaten.ilike.${like}`,
        `provinsi.ilike.${like}`,
      ];
      if (jenisUsahaIds.length) orParts.push(`jenis_usaha_id.in.(${jenisUsahaIds.join(",")})`);

      query = query.or(orParts.join(","));
    }

    const { data } = await query
      .order("nama")
      .order("urutan", { referencedTable: "peserta_nomor_usaha" })
      .limit(100);
    rows = (data ?? []) as unknown as HasilRow[];
  }

  return (
    <div className={`cu-page ${display.variable} ${body.variable} ${mono.variable}`}>
      <section className="cu-hero">
        <a href="/login" className="cu-login-btn">
          <LogIn className="h-3.5 w-3.5" /> Masuk
        </a>
        <div className="cu-hero-inner">
          <span className="cu-eyebrow">
            <Store className="h-3.5 w-3.5" /> Direktori Usaha Warga
          </span>

          <h1 className="cu-title cu-display">
            {TITLE.split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${0.12 + i * 0.03}s` }}>
                {ch === " " ? " " : ch}
              </span>
            ))}
          </h1>

          <p className="cu-subhead">
            Temukan usaha & jasa milik sesama peserta, lalu hubungi langsung lewat WhatsApp.
            Cari berdasarkan jenis usaha, merk/barang, nama toko, alamat, atau kota — sarana saling bantu promosi.
          </p>

          <form className="cu-search-form">
            <div className="cu-search-wrap">
              <Search className="cu-search-icon h-4 w-4" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Contoh: Furniture, TV LG, nama toko, kota..."
                className="cu-search-input"
                autoFocus
              />
            </div>
            <button type="submit" className="cu-search-btn">
              <Search className="h-4 w-4" /> Cari
            </button>
          </form>

          {kategori.length > 0 && (
            <div className="cu-ticker">
              <div className="cu-ticker-track">
                {[...kategori, ...kategori].map((k, i) => (
                  <a key={i} href={`/cari-usaha?q=${encodeURIComponent(k)}`} className="cu-chip">
                    {k}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="cu-body">
        {!q && (
          <div className="cu-empty">
            <div className="cu-empty-title">Belum ada kata kunci</div>
            <p className="cu-empty-text">
              Ketik jenis usaha atau merk di kotak pencarian di atas, atau langsung pilih salah satu kategori berikut.
            </p>
            {kategori.length > 0 && (
              <div className="cu-suggest-grid" style={{ justifyContent: "center" }}>
                {kategori.map((k) => (
                  <a key={k} href={`/cari-usaha?q=${encodeURIComponent(k)}`} className="cu-suggest-pill">
                    {k}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {q && (
          <>
            <div className="cu-result-meta">
              <span className="cu-result-count">
                {rows.length > 0 ? (
                  <>
                    <strong>{rows.length}</strong> hasil untuk &ldquo;{q}&rdquo;
                  </>
                ) : (
                  <>Tidak ada hasil untuk &ldquo;{q}&rdquo;</>
                )}
              </span>
              <a href="/cari-usaha" className="cu-result-clear">
                reset
              </a>
            </div>

            {rows.length === 0 && (
              <div className="cu-empty">
                <div className="cu-empty-title">Belum ketemu</div>
                <p className="cu-empty-text">
                  Coba kata kunci lain, atau pilih salah satu kategori yang tersedia berikut.
                </p>
                {kategori.length > 0 && (
                  <div className="cu-suggest-grid" style={{ justifyContent: "center" }}>
                    {kategori.map((k) => (
                      <a key={k} href={`/cari-usaha?q=${encodeURIComponent(k)}`} className="cu-suggest-pill">
                        {k}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {rows.length > 0 && (
              <div className="cu-list">
                {rows.map((r, i) => {
                  const nomorUsaha = r.peserta_nomor_usaha ?? [];
                  const tabCode = (r.jenis_usaha?.nama ?? r.nama).slice(0, 2).toUpperCase();
                  return (
                    <article
                      key={r.id}
                      className="cu-card"
                      style={{ animationDelay: `${Math.min(i, 10) * 0.05}s` }}
                    >
                      <span className={`cu-card-tab cu-tab-${i % 3}`}>{tabCode}</span>
                      <div className="cu-card-top">
                        <span className="cu-card-name">{r.nama}</span>
                        {r.jenis_usaha?.nama && <span className="cu-card-badge">{r.jenis_usaha.nama}</span>}
                      </div>
                      {r.keterangan && <p className="cu-card-keterangan">{r.keterangan}</p>}
                      <div className="cu-card-addr">
                        <MapPin className="h-4 w-4" />
                        <span>
                          {r.alamat}
                          {(r.kota_kabupaten || r.provinsi) && (
                            <>, {[r.kota_kabupaten, r.provinsi].filter(Boolean).join(", ")}</>
                          )}
                        </span>
                      </div>
                      <div className="cu-card-footer cu-card-footer-multi">
                        {nomorUsaha.length === 0 && (
                          <span className="cu-wa-static">Kontak belum tersedia</span>
                        )}
                        {nomorUsaha.map((n, ni) => {
                          const waTarget = normalizeWaNumber(n.nomor);
                          return waTarget ? (
                            <a
                              key={ni}
                              href={`https://wa.me/${waTarget}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cu-wa-btn"
                            >
                              <Phone className="h-3.5 w-3.5" /> {n.label ? `${n.label}: ` : ""}
                              {n.nomor}
                            </a>
                          ) : (
                            <span key={ni} className="cu-wa-static">
                              <Phone className="h-3.5 w-3.5" /> {n.label ? `${n.label}: ` : ""}
                              {n.nomor}
                            </span>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
