/**
 * Chat da Helena via Groq (chave só no servidor Vercel).
 * POST /api/ai/chat  { messages, tools?, tool_choice?, temperature?, max_tokens? }
 */

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });

  const key = String(process.env.GROQ_API_KEY || "").trim();
  if (!key) return send(res, 503, { error: "GROQ_API_KEY ausente no ambiente." });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  } catch {
    return send(res, 400, { error: "JSON inválido." });
  }
  if (!Array.isArray(body.messages)) return send(res, 400, { error: "Campo messages é obrigatório." });

  const model = String(process.env.VITE_GROQ_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b");
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        tools: body.tools,
        tool_choice: body.tool_choice,
        temperature: body.temperature ?? 0.3,
        max_tokens: body.max_tokens ?? 1024,
      }),
      signal: AbortSignal.timeout(35_000),
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(text);
  } catch (error) {
    send(res, 502, { error: error?.message || "Groq indisponível." });
  }
}
