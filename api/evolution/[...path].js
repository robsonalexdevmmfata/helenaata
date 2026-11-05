/**
 * Repasse Evolution → Hostless.
 * A EVOLUTION_KEY fica só na Vercel/Render. O browser chama /api/evolution/*.
 * Quando o Render tiver EVOLUTION_URL+KEY, o rewrite pode voltar pra lá;
 * até lá este proxy mantém o chip vendável.
 */

const HOSTLESS = () =>
  String(process.env.EVOLUTION_URL || "https://evolutionapi.hostless.app").replace(/\/$/, "");
const KEY = () => String(process.env.EVOLUTION_KEY || "").trim();

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const key = KEY();
  if (!key) return send(res, 500, { error: "EVOLUTION_KEY ausente no ambiente." });

  const parts = [].concat(req.query?.path || []);
  const rest = parts.length ? `/${parts.map(encodeURIComponent).join("/")}` : "";
  const search = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `${HOSTLESS()}${rest}${search}`;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let body;
  if (hasBody) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(25_000),
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(text);
  } catch (error) {
    send(res, 502, { error: error?.message || "Hostless indisponível." });
  }
}
