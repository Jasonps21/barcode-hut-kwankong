import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/log-error";
import { getCurrentProfile } from "@/lib/auth";

/**
 * Endpoint publik (sengaja tanpa requireProfile) supaya error di halaman
 * login/publik pun tetap tercatat. Dipanggil dari error.tsx, global-error.tsx,
 * dan ErrorListener (window.onerror / unhandledrejection).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { message, stack, digest, url, context } = (body ?? {}) as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const profile = await getCurrentProfile().catch(() => null);

  await logError({
    source: "client",
    message,
    stack: typeof stack === "string" ? stack : null,
    digest: typeof digest === "string" ? digest : null,
    url: typeof url === "string" ? url : req.headers.get("referer"),
    userId: profile?.id ?? null,
    userAgent: req.headers.get("user-agent"),
    context: context && typeof context === "object" ? (context as Record<string, unknown>) : null,
  });

  return NextResponse.json({ ok: true });
}
