// FreeLLMAPI Integration (tashfeenahmed/freellmapi)
// 7.4 billion tokens per month. 34 free LLM providers. 635 free model endpoints.
// All behind one OpenAI-compatible /v1 endpoint with Smart Routing & Automatic Failover.

export interface FreeLLMConfig {
  endpoint: string;
  apiKey: string; // Optional if running locally, or personal secret token
  defaultModel: string;
  autoFailover: boolean;
  enabled: boolean;
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
  const target = `${url}/models`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(target, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { ok: true, message: `Conectado com sucesso! Latência: ${latencyMs}ms`, latencyMs };
    }
    return { ok: false, message: `Servidor retornou status HTTP ${res.status}`, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      ok: false,
      message: err.name === "AbortError" ? "Timeout: Servidor demorou mais de 4s para responder" : "Não foi possível conectar ao endpoint local (verifique se o FreeLLMAPI está rodando na porta 8000)",
      latencyMs,
    };
  }
}

export async function callFreeLLMOrchestrator(
  userMessage: string,
  history: Array<{ role: string; content: string }> = []
) {
  const config = getFreeLLMConfig();
  if (!config.enabled) return null;

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
    console.warn("FreeLLMAPI offline or unreachable:", err);
    return null;
  }
}
