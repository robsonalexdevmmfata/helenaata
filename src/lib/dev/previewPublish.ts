import { RENDER_API_ORIGIN } from "@/lib/api-origin";
import type { SitePreview } from "@/lib/types";

export { RENDER_API_ORIGIN };

function previewApiBases() {
  const env = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const bases = [env, RENDER_API_ORIGIN];
  if (typeof window !== "undefined" && !/vercel\.app$/i.test(window.location.hostname)) {
    bases.push("");
  }
  bases.push("https://helenaata.onrender.com");
  return [...new Set(bases)];
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Grava as prévias no Render para o link da Vercel abrir no celular do prospecto. */
export function publishSitePreviews(previews: SitePreview[]) {
  if (!previews.length) return;
  if (typeof process !== "undefined" && process.env?.VITEST) return;
  const body = JSON.stringify({ previews });
  for (const base of previewApiBases()) {
    void fetchJson(`${base}/api/previews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }, 45_000).catch((err) => console.warn("[Prévia pública]", base || "local", err));
  }
}

export async function fetchPublishedPreview(slug: string): Promise<SitePreview | null> {
  const path = `/api/previews/${encodeURIComponent(slug)}`;
  for (const base of previewApiBases()) {
    try {
      const res = await fetchJson(`${base}${path}`, { headers: { Accept: "application/json" } }, 45_000);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.preview) return data.preview as SitePreview;
    } catch {
      /* tenta o próximo host (Render pode estar acordando) */
    }
  }
  return null;
}
