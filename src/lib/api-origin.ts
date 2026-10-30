export const RENDER_API_ORIGIN = "https://helenaata.onrender.com";

export function helenaApiOrigin() {
  return String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}

export function helenaApiBases() {
  const env = helenaApiOrigin();
  const onRender =
    typeof window !== "undefined" && /onrender\.com$/i.test(window.location.hostname);
  if (onRender) return [""];
  const bases = [""];
  if (env && !/localhost|127\.0\.0\.1/i.test(env)) bases.push(env);
  bases.push(RENDER_API_ORIGIN);
  return [...new Set(bases)];
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
