import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUKTI_BUCKET = "bukti-transfer";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];

/**
 * Upload bukti transfer ke Storage (bucket privat). Mengembalikan path file,
 * atau melempar error bila tidak valid. Return null bila tidak ada file.
 */
export async function uploadBukti(
  admin: SupabaseClient,
  pesertaId: string,
  file: File | null,
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new Error("Ukuran file bukti maksimal 8MB.");
  if (file.type && !ALLOWED.includes(file.type)) {
    throw new Error("Format bukti harus gambar (PNG/JPG/WEBP) atau PDF.");
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${pesertaId}/${Date.now()}.${ext || "bin"}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUKTI_BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Gagal upload bukti: ${error.message}`);
  return path;
}

/** Buat signed URL (default 1 jam) untuk melihat bukti dari bucket privat. */
export async function getBuktiSignedUrl(
  admin: SupabaseClient,
  path: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin.storage.from(BUKTI_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
