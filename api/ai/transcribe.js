/**
 * Transcrição de áudio WhatsApp via Groq Whisper (chave só no servidor).
 * POST /api/ai/transcribe  { base64, mimetype?, fileName? }
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

  const raw = String(body.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!raw) return send(res, 400, { error: "Campo base64 é obrigatório." });

  const mime = String(body.mimetype || "audio/ogg").split(";")[0] || "audio/ogg";
  const name = String(body.fileName || (mime.includes("mpeg") || mime.includes("mp3") ? "audio.mp3" : "audio.ogg"));
  const bytes = Buffer.from(raw, "base64");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), name);
  form.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "json");

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return send(res, 502, { error: data?.error?.message || `Whisper ${upstream.status}` });
    }
    send(res, 200, { text: String(data?.text || "").trim() });
  } catch (error) {
    send(res, 502, { error: error?.message || "Whisper indisponível." });
  }
}
