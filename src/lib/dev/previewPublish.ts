import type { SitePreview } from "@/lib/types";

function apiBase() {
  const fromEnv = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && /vercel\.app$/i.test(window.location.hostname)) {
    return "https://helena-ai.onrender.com";
  }
  return "";
}

/** Grava as prévias no Render para o link da Vercel abrir no celular do prospecto. */
export function publishSitePreviews(previews: SitePreview[]) {
  if (!previews.length) return;
  if (typeof process !== "undefined" && process.env?.VITEST) return;
  const base = apiBase();
  const url = `${base}/api/previews`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ previews }),
  }).catch((err) => console.warn("[Prévia pública]", err));
}

export async function fetchPublishedPreview(slug: string): Promise<SitePreview | null> {
  const base = apiBase();
  try {
    const res = await fetch(`${base}/api/previews/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.preview as SitePreview) ?? null;
  } catch {
    return null;
  }
}
