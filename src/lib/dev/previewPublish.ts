import type { SitePreview } from "@/lib/types";
import { update } from "@/lib/store";

export const RENDER_API_ORIGIN = "https://helenaata.onrender.com";
const HANDOFF_KEY = "helena-preview-handoff";

/** Guarda a prévia na aba pra /v/:slug abrir mesmo antes do Supabase responder. */
export function stashPreviewHandoff(preview: SitePreview) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(preview));
  } catch {
    /* quota */
  }
}

export function readPreviewHandoff(slug: string): SitePreview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const row = JSON.parse(raw) as SitePreview;
    if (row?.slug === slug && row?.name) return row;
  } catch {
    /* ignore */
  }
  return null;
}

function previewApiBases() {
  const env = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const bases = [RENDER_API_ORIGIN, ""];
  if (env) bases.unshift(env);
  return [...new Set(bases)];
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type PublishResult = { ok?: boolean; vercelUrl?: string; githubUrl?: string; error?: string };

/** Cria repo público no GitHub e faz deploy na Vercel (tokens só no servidor). */
export async function publishSitePreviews(previews: SitePreview[]): Promise<Record<string, PublishResult>> {
  const out: Record<string, PublishResult> = {};
  if (!previews.length) return out;
  if (typeof process !== "undefined" && process.env?.VITEST) return out;

  const body = JSON.stringify({ previews });
  // Grava JSON no Supabase (link /v/slug). Não pode ser fire-and-forget.
  for (const base of previewApiBases()) {
    try {
      const res = await fetchJson(`${base}/api/previews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }, 45_000);
      if (res.ok) break;
    } catch {
      /* tenta próximo host */
    }
  }

  for (const preview of previews.slice(0, 12)) {
    try {
      let data: PublishResult = { ok: false, error: "Servidor de publish indisponível." };
      for (const base of previewApiBases()) {
        try {
          const res = await fetchJson(`${base}/api/dev/publish-client`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preview }),
          }, 90_000);
          const json = (await res.json().catch(() => ({}))) as PublishResult;
          if (res.ok && json.ok) {
            data = json;
            break;
          }
          data = json.ok === false ? json : { ok: false, error: json.error || `HTTP ${res.status}` };
        } catch {
          /* tenta o próximo host (Render / relativo) */
        }
      }
      out[preview.slug] = data;
      update((d) => {
        const row = d.sitePreviews.find((p) => p.id === preview.id);
        if (!row) return;
        if (data.githubUrl) row.githubUrl = data.githubUrl;
        if (data.vercelUrl) {
          row.vercelUrl = data.vercelUrl;
          row.previewPath = data.vercelUrl;
        }
        row.deployError = data.ok ? undefined : data.error;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Falha no deploy";
      out[preview.slug] = { ok: false, error };
      update((d) => {
        const row = d.sitePreviews.find((p) => p.id === preview.id);
        if (row) row.deployError = error;
      });
    }
  }
  return out;
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
      /* próximo host */
    }
  }
  return null;
}
