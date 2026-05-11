export interface ParsedRange {
  prefix: string;
  start: number;
  end: number;
  padding: number;
  total: number;
}

const RANGE_RE = /^\s*([A-Za-z][A-Za-z0-9-]*?)(\d+)\s*-\s*\1(\d+)\s*$/;

export function parseRange(input: string): ParsedRange {
  const m = input.match(RANGE_RE);
  if (!m) {
    throw new Error(
      'Format range tidak valid. Contoh yang benar: "A0001 - A0300" atau "KP-001 - KP-300".',
    );
  }
  const [, prefix, startStr, endStr] = m;
  if (startStr.length !== endStr.length) {
    throw new Error("Panjang nomor awal dan akhir harus sama (mis. 0001-0300).");
  }
  const start = Number(startStr);
  const end = Number(endStr);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
    throw new Error("Nomor harus angka positif.");
  }
  if (start > end) {
    throw new Error("Nomor awal harus lebih kecil atau sama dengan nomor akhir.");
  }
  const total = end - start + 1;
  if (total > 5000) {
    throw new Error("Maksimal 5000 kupon per kelompok.");
  }
  return { prefix, start, end, padding: startStr.length, total };
}

const PREFIX_RE = /^[A-Za-z0-9-]+$/;
const NUMERIC_RE = /^\d+$/;

export function parseRangeFields(prefix: string, startStr: string, endStr: string): ParsedRange {
  const p = prefix.trim();
  const s = startStr.trim();
  const e = endStr.trim();

  if (!p) throw new Error("Prefix wajib diisi.");
  if (!PREFIX_RE.test(p)) {
    throw new Error('Prefix hanya boleh huruf, angka, dan dash. Contoh: "2026A" atau "KP-".');
  }
  if (!s || !e) throw new Error("Nomor awal dan akhir wajib diisi.");
  if (!NUMERIC_RE.test(s) || !NUMERIC_RE.test(e)) {
    throw new Error("Nomor awal dan akhir harus angka (boleh ada nol di depan).");
  }
  if (s.length !== e.length) {
    throw new Error("Panjang nomor awal dan akhir harus sama (mis. 0001-0500).");
  }
  const start = Number(s);
  const end = Number(e);
  if (start <= 0 || end <= 0) throw new Error("Nomor harus angka positif.");
  if (start > end) throw new Error("Nomor awal harus lebih kecil atau sama dengan nomor akhir.");
  const total = end - start + 1;
  if (total > 5000) throw new Error("Maksimal 5000 kupon per kelompok.");

  return { prefix: p, start, end, padding: s.length, total };
}

export function buildNomorKupon(prefix: string, n: number, padding: number): string {
  return `${prefix}${String(n).padStart(padding, "0")}`;
}

export function rangesOverlap(
  a: { prefix: string; start: number; end: number },
  b: { prefix: string; start: number; end: number },
): boolean {
  if (a.prefix !== b.prefix) return false;
  return a.start <= b.end && b.start <= a.end;
}
