// Groq Cloud LLM Integration for HELENA AI Orchestrator
import { getDB } from "@/lib/store";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export function getGroqApiKey(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_GROQ_API_KEY) {
    return import.meta.env.VITE_GROQ_API_KEY;
  }
  if (typeof process !== "undefined" && process.env?.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY;
  }
  return "";
}

export function getGroqModel(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_GROQ_MODEL) {
    return import.meta.env.VITE_GROQ_MODEL;
  }
  return "openai/gpt-oss-120b";
}

export interface GroqToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface GroqResponse {
  text: string;
  toolCalls?: GroqToolCall[];
}

export const GROQ_TOOLS = [
  {
    type: "function",
    function: {
      name: "prospect_scan_maps",
      description:
        "Varre empresas e negócios locais no Google Maps que NÃO possuem site (com tag #sem-site) e as cadastra diretamente no CRM.",
      parameters: {
        type: "object",
        properties: {
          segment: {
            type: "string",
            description: "Segmento a buscar (ex: Clínicas odontológicas, Estética, Agências, Consultórios)",
          },
          city: {
            type: "string",
            description: "Cidade e UF para busca (ex: São Paulo, SP ou Campinas, SP)",
          },
          limit: {
            type: "number",
            description: "Quantidade de empresas a prospectar (padrão: 10 a 50)",
          },
        },
        required: ["segment", "city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_create_event",
      description:
        "Agenda uma reunião com o cliente no Google Calendar / Cal.com e associa ao lead/oportunidade.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da reunião (ex: Reunião de Proposta de Site)" },
          contactId: { type: "string", description: "ID do contato" },
          dealId: { type: "string", description: "ID da oportunidade (opcional)" },
          date: { type: "string", description: "Data e hora da reunião no formato ISO ou YYYY-MM-DD HH:mm" },
        },
        required: ["contactId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "operations_start",
      description: "Inicia uma operação completa de prospecção com agentes SDRs e acompanhamento.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da operação" },
          objective: { type: "string", description: "Objetivo da operação" },
          total: { type: "number", description: "Quantidade total de contatos a abordar" },
        },
        required: ["title", "objective", "total"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_activate",
      description: "Ativa o time comercial ou de marketing para iniciar abordagens e vendas.",
      parameters: {
        type: "object",
        properties: {
          teamName: { type: "string", description: "Nome do time (ex: Comercial ou Marketing)" },
        },
        required: ["teamName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crm_search_contacts",
      description: "Pesquisa contatos, leads ou empresas no CRM.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termo de busca (ex: sem-site, quente, clínicas)" },
        },
        required: ["query"],
      },
    },
  },
];

export async function callGroqOrchestrator(
  userMessage: string,
  history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [],
): Promise<GroqResponse | null> {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  const db = getDB();
  const org = db.organization.name;
  const user = db.users.find((u) => u.id === db.currentUserId)?.name || "Gestor";

  const systemPrompt = `Você é HELENA, a Inteligência Artificial Orquestradora e Sistema Operacional Executivo da ${org}.
Seu interlocutor é ${user}.
DIFERENCIAL: Você não é um chatbot passivo. Você comanda o time de IA, o CRM e operações reais.
Seus agentes subordinados:
- Supervisor Comercial
- SDR 01 e SDR 02: Prospectam e abordam empresas (especialmente negócios sem site no Google Maps)
- Qualificador: Qualifica respostas de clientes
- Closer: Conduz reuniões e fecha contratos de venda de sites e marketing
- Atendimento Geral e Suporte

Você tem acesso a ferramentas reais (Google Maps Scraper para achar empresas sem site, agendamento no Google Calendar/Cal.com, ativação de times, operações de prospecção).
Quando o usuário pedir algo que requer ferramenta, use a Tool Call apropriada.
Seja sempre executiva, confiante, direta, cordial e estratégica.
Responda sempre em Português do Brasil.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    { role: "user", content: userMessage },
  ];

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getGroqModel(),
        messages,
        tools: GROQ_TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      console.warn("Groq API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) return null;

    const toolCalls: GroqToolCall[] = [];
    if (choice.tool_calls && Array.isArray(choice.tool_calls)) {
      for (const tc of choice.tool_calls) {
        try {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || "{}"),
          });
        } catch {
          // ignore argument parse error
        }
      }
    }

    return {
      text: choice.content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (err) {
    console.warn("Failed to contact Groq Cloud:", err);
    return null;
  }
}
