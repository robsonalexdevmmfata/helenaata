// Chamadas de IA feitas pelo servidor (a chave nunca vai para o navegador).
// Ordem: Groq (GROQ_API_KEY) -> FreeLLMAPI (FREELLMAPI_URL).

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export function aiProvider() {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.FREELLMAPI_URL) return "freellmapi";
  return null;
}

/** Whisper via Groq — o time escuta áudio do WhatsApp. */
export async function transcribeAudio({ base64, mimetype, fileName }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    const err = new Error("GROQ_API_KEY ausente — não dá para transcrever áudio.");
    err.status = 503;
    throw err;
  }
  const raw = String(base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!raw) {
    const err = new Error("Áudio vazio.");
    err.status = 400;
    throw err;
  }
  const bytes = Buffer.from(raw, "base64");
  const mime = String(mimetype || "audio/ogg").split(";")[0] || "audio/ogg";
  const name = String(fileName || (mime.includes("mpeg") || mime.includes("mp3") ? "audio.mp3" : "audio.ogg"));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), name);
  form.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Whisper ${res.status}`);
      err.status = 502;
      throw err;
    }
    return { text: String(data?.text || "").trim() };
  } finally {
    clearTimeout(timer);
  }
}

/** Repassa um corpo no formato OpenAI (/chat/completions) e devolve a resposta crua. */
export async function chatCompletion(body) {
  const provider = aiProvider();
  if (!provider) {
    const err = new Error("Nenhuma IA configurada no servidor (defina GROQ_API_KEY ou FREELLMAPI_URL).");
    err.status = 503;
    throw err;
  }

  const isGroq = provider === "groq";
  const url = isGroq ? GROQ_URL : `${process.env.FREELLMAPI_URL.replace(/\/$/, "")}/chat/completions`;
  const key = isGroq ? process.env.GROQ_API_KEY : process.env.FREELLMAPI_KEY;
  const model = body.model || (isGroq ? process.env.GROQ_MODEL || "llama-3.3-70b-versatile" : process.env.FREELLMAPI_MODEL || "auto");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ temperature: 0.4, max_tokens: 1024, ...body, model }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `IA respondeu ${res.status}`);
      err.status = 502;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const STAGE_PROMPT = {
  sdr: "Primeiro contato. Seja irresistível sem ser agressiva: mostre a dor (some no Google da região), uma prova rápida e uma pergunta. Se disserem que amigo/amiga/conhecido vai fazer o site, respeite e desloque para resultado + prazo (você sobe em dias; o conhecido muitas vezes demora e some). Nunca jogue preço sem pedirem.",
  qualificador:
    "O cliente demonstrou interesse. Qualifique com calma (orçamento, prazo, quem decide) e proponha dois horários para uma reunião rápida de 10 minutos.",
  closer:
    "Feche com leveza: 10 minutos, site no ar, WhatsApp integrado. Preço só se pedirem (entrada R$ 100/mês no catálogo). Se for advocacia, fale em captar cliente que busca no Google enquanto o escritório está no fórum.",
};

export async function helenaReply({ stage, history, text, name }) {
  const system = `Você é a Helena, consultora comercial da Info Tech Ltda (sites, cardápio e IA no WhatsApp).
Fale como uma pessoa real no WhatsApp: frases curtas, tom simpático, confiante e direto, português do Brasil.
Seja persuasiva e difícil de recusar: uma dor concreta + um ganho claro + pergunta de avanço.
Nunca use emojis, listas, negrito ou markdown. Nunca diga que é uma IA, robô ou que vai transferir a conversa.
Se a mensagem vier com prefixo [Áudio], trate como o que o lead falou em voz.
Contato: ${name || "cliente"}.
${STAGE_PROMPT[stage] || STAGE_PROMPT.sdr}`;

  const data = await chatCompletion({
    messages: [{ role: "system", content: system }, ...history.slice(-10), { role: "user", content: text }],
    temperature: 0.6,
    max_tokens: 400,
  });
  return data?.choices?.[0]?.message?.content?.trim() || "";
}
