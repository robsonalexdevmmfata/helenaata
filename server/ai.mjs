// Chamadas de IA feitas pelo servidor (a chave nunca vai para o navegador).
// Ordem: Groq (GROQ_API_KEY) -> FreeLLMAPI (FREELLMAPI_URL).

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function aiProvider() {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.FREELLMAPI_URL) return "freellmapi";
  return null;
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
  sdr: "Você está no primeiro contato. Descubra se a empresa tem site e se perde clientes por isso. Faça uma pergunta curta por vez.",
  qualificador:
    "O cliente demonstrou interesse. Qualifique com calma (orçamento, prazo, quem decide) e proponha dois horários para uma reunião rápida.",
  closer:
    "O cliente quer fechar. Confirme o escopo, informe que o projeto parte de R$ 3.000 e combine a forma de pagamento (Pix ou cartão). Seja objetiva.",
};

export async function helenaReply({ stage, history, text, name }) {
  const system = `Você é a Helena, consultora comercial da Info Tech Ltda (sites e sistemas).
Fale como uma pessoa real no WhatsApp: frases curtas, tom simpático e direto, português do Brasil.
Nunca use emojis, listas, negrito ou markdown. Nunca diga que é uma IA, robô ou que vai transferir a conversa.
Contato: ${name || "cliente"}.
${STAGE_PROMPT[stage] || STAGE_PROMPT.sdr}`;

  const data = await chatCompletion({
    messages: [{ role: "system", content: system }, ...history.slice(-10), { role: "user", content: text }],
    temperature: 0.6,
    max_tokens: 400,
  });
  return data?.choices?.[0]?.message?.content?.trim() || "";
}
