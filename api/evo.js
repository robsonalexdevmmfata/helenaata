/**
 * Proxy único Helena → Hostless Evolution.
 * Uso: /api/evo?p=/instance/create
 * EVOLUTION_KEY só no ambiente (Vercel).
 */

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

  const key = String(process.env.EVOLUTION_KEY || "").trim();
  if (!key) return send(res, 500, { error: "EVOLUTION_KEY ausente no ambiente." });

  const host = String(process.env.EVOLUTION_URL || "https://evolutionapi.hostless.app").replace(/\/$/, "");
  let path = "/";
  try {
    const u = new URL(req.url || "/", "http://localhost");
    path = u.searchParams.get("p") || "/";
    if (!path.startsWith("/")) path = `/${path}`;
  } catch {
    path = "/";
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let body;
  if (hasBody) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  try {
    const upstream = await fetch(`${host}${path}`, {
      method: req.method,
      headers: { apikey: key, "Content-Type": "application/json" },
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
