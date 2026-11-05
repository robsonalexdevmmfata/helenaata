// FreeLLMAPI Integration (tashfeenahmed/freellmapi)
// 7.4 billion tokens per month. 34 free LLM providers. 635 free model endpoints.
// All behind one OpenAI-compatible /v1 endpoint with Smart Routing & Automatic Failover.

export interface FreeLLMConfig {
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  autoFailover: boolean;
  enabled: boolean;
  monthlyBudget: number; // R$ 0 = sem limite; com FreeLLMAPI é sempre gratuito
}

export const FREE_LLM_MODELS = [
  { id: "freellm/deepseek-v3", name: "DeepSeek-V3 (671B)", provider: "DeepSeek / Free Router", tag: "Recomendado · Raciocínio & Código" },
  { id: "freellm/llama-3.3-70b", name: "Llama 3.3 70B Versatile", provider: "Meta / Groq / SambaNova", tag: "Ideal para SDRs & Vendas" },
  { id: "freellm/qwen-2.5-72b", name: "Qwen 2.5 72B Instruct", provider: "Alibaba / Hyperbolic", tag: "Ultra Rápido" },
  { id: "freellm/gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google AI Studio Free", tag: "Latência Mínima" },
  { id: "freellm/auto-failover", name: "Smart Auto-Failover (34 Provedores)", provider: "FreeLLMAPI Engine", tag: "Zero Queda · Failover Automático" },
];

export const FREE_LLM_PROVIDERS_LIST = [
  "Groq", "Cloudflare Workers AI", "Google AI Studio", "Cerebras", "SambaNova Systems",
  "Mistral AI", "Together AI", "DeepInfra", "Hyperbolic", "Cohere", "HuggingFace",
  "OpenRouter (Free Tier)", "Novita AI", "Github Models", "AI21 Labs", "Replicate",
  "Perplexity (Sonar)", "Fireworks AI", "FriendliAI", "Inference.net", "Nebius AI",
  "SiliconFlow", "Chutes.ai", "Baseten", "Scaleway", "Lepton AI", "Lambda Labs",
  "OctoAI", "Predibase", "Anyscale", "DeepSeek Direct", "Mistral Codestral", "Alibaba DashScope", "MonsterAPI"
];

const STORAGE_KEY = "helena_freellmapi_config";

export function getFreeLLMConfig(): FreeLLMConfig {
  if (typeof window === "undefined") {
    return {
      endpoint: "http://localhost:8000/v1",
      apiKey: "",
      defaultModel: "freellm/llama-3.3-70b",
      autoFailover: true,
      enabled: true,
      monthlyBudget: 0,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  const defaults: FreeLLMConfig = {
    endpoint: "http://localhost:8000/v1",
    apiKey: "",
    defaultModel: "freellm/llama-3.3-70b",
    autoFailover: true,
    enabled: true,
    monthlyBudget: 0,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {}
  return defaults;
}

export function saveFreeLLMConfig(config: Partial<FreeLLMConfig>): FreeLLMConfig {
  const current = getFreeLLMConfig();
  const updated = { ...current, ...config };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export async function testFreeLLMConnection(endpointUrl?: string): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const url = (endpointUrl || getFreeLLMConfig().endpoint).replace(/\/$/, "");
  const start = Date.now();

  // Tenta /models primeiro (padrão OpenAI-compatible), depois /health como fallback
  const targets = [`${url}/models`, `${url}/health`, url];

  for (const target of targets) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(target, { method: "GET", signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      if (res.ok || res.status === 404) {
        // 404 em /models ainda indica que o servidor está no ar
        return { ok: true, message: `Conectado! Latência: ${latencyMs}ms`, latencyMs };
      }
    } catch {
      // Tenta o próximo endpoint
    }
  }

  const latencyMs = Date.now() - start;
  return {
    ok: false,
    message: `Servidor offline ou inacessível em ${url}. Rode: git clone https://github.com/tashfeenahmed/freellmapi && python main.py`,
    latencyMs,
  };
}

export async function callFreeLLMOrchestrator(
  userMessage: string,
  history: Array<{ role: string; content: string }> = []
) {
  const config = getFreeLLMConfig();
  if (!config.enabled) return null;
  // Em produção (Vercel) o FreeLLM local não existe — não spammar localhost:8000.
  if (typeof window !== "undefined" && /localhost|127\.0\.0\.1/i.test(config.endpoint)) {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") return null;
  }

  const url = `${config.endpoint.replace(/\/$/, "")}/chat/completions`;
  const modelName = config.defaultModel.replace("freellm/", "");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: modelName === "auto-failover" ? "llama-3.3-70b-versatile" : modelName,
        messages: [
          {
            role: "system",
            content: "Você é a HELENA AI, Tech Lead e orquestradora comercial da agência Info Tech Ltda. Responda em Português do Brasil com foco executivo em vendas, prospecção e fechamento.",
          },
          ...history.slice(-5),
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    /* failover silencioso */
    return null;
  }
}
