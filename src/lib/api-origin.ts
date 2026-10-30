/** Render onde rodam /health, WhatsApp e /api/evolution. */
export const RENDER_API_ORIGIN = "https://helena-ai.onrender.com";

export function helenaApiOrigin() {
  const env = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  if (env) return env;
  if (typeof window !== "undefined" && /vercel\.app$/i.test(window.location.hostname)) {
    return RENDER_API_ORIGIN;
  }
  return "";
}

export function isLocalEvolutionHost(url?: string) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}
