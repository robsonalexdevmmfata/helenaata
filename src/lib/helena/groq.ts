// Groq Cloud & FreeLLMAPI Integration for HELENA AI Orchestrator
import { getDB } from "@/lib/store";
import { callFreeLLMOrchestrator, getFreeLLMConfig } from "./freellmapi";
import { CALENDAR_TOOL_PROMPT, ROBSON_OPENING_SCRIPT } from "./calendar";
import { formatCatalogForAgents } from "@/lib/catalog";

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
        "Varredura nacional (OpenStreetMap + FreeLLMAPI) de negócios SEM site e COM WhatsApp válido. Importa só esses leads no CRM (#sem-site) e dispara o Time Comercial.",
      parameters: {
        type: "object",
        properties: {
          segment: {
            type: "string",
            description: "Nicho (ex: Dentistas, Escritórios de Odontologia, Clínicas Médicas)",
          },
          city: {
            type: "string",
            description: "Cidade e UF, lista de cidades, ou 'Brasil' para varredura nacional",
          },
          state: {
            type: "string",
            description: "UF (SP, RJ…) ou TODOS para Brasil inteiro",
          },
          nationwide: {
            type: "boolean",
            description: "true = Brasil inteiro (polos planejados pelo FreeLLMAPI)",
          },
          limit: {
            type: "number",
            description: "Quantidade máxima de empresas a importar (padrão 10)",
          },
        },
        required: ["segment"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_create_event",
      description:
        "agendarReuniao(leadId, dataHora, resumo): grava o compromisso na Agenda compartilhada do painel e associa ao lead.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string", description: "ID do lead/contato" },
          contactId: { type: "string", description: "Alias de leadId" },
          dataHora: { type: "string", description: "Data e hora ISO da reunião" },
          date: { type: "string", description: "Alias de dataHora" },
          resumo: { type: "string", description: "Resumo do compromisso" },
          title: { type: "string", description: "Título da reunião" },
          dealId: { type: "string", description: "ID da oportunidade (opcional)" },
          agenteId: { type: "string", description: "ID do agente que fechou o horário" },
        },
        required: ["resumo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_agendar_reuniao",
      description: "Alias de agendarReuniao(leadId, dataHora, resumo) para o Time Comercial.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "string" },
          dataHora: { type: "string" },
          resumo: { type: "string" },
          agenteId: { type: "string" },
        },
        required: ["leadId", "dataHora", "resumo"],
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
  {
    type: "function",
    function: {
      name: "sales_handle_objection",
      description: "Contorna objeções de clientes usando a Matriz de Vendas Estratégica da Helena (ex: já tenho instagram, quanto custa, sem tempo, caro).",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "ID do contato" },
          objectionId: { type: "string", description: "Identificador da objeção (obj_instagram, obj_preco, obj_ocupado, obj_caro, obj_sem_interesse)" },
        },
        required: ["contactId", "objectionId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sales_generate_checkout_pix",
      description: "Gera link de checkout e chave Pix instantânea para fechamento de contrato e manda no WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "ID do contato" },
          amount: { type: "number", description: "Valor do projeto em reais (ex: 4900)" },
        },
        required: ["contactId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sales_rescue_cold_leads",
      description: "Varre o pipeline por oportunidades paradas há mais de 48h e dispara mensagem de resgate com oferta especial de parcelamento.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export async function callGroqOrchestrator(
  userMessage: string,
  history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [],
): Promise<GroqResponse | null> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    const freeConfig = getFreeLLMConfig();
    if (freeConfig.enabled) {
      const freeReply = await callFreeLLMOrchestrator(userMessage, history);
      if (freeReply) return { text: freeReply };
    }
    return null;
  }

  const db = getDB();
  const org = db.organization.name;
  const user = db.users.find((u) => u.id === db.currentUserId)?.name || "Gestor";

  const systemPrompt = `Você é a HELENA, orquestradora principal (estilo Jarvis) da agência Info Tech Ltda (${org}).
Seu interlocutor é ${user}.
Você NÃO faz a abordagem individual do WhatsApp: delega ao Time Comercial (Supervisor, SDR 01, SDR 02, Qualificador, Closer).

Abordagem inicial obrigatória (personalidade Robson Alex, CEO):
${ROBSON_OPENING_SCRIPT}

${formatCatalogForAgents(db.serviceOffers ?? [])}

Quebra de objeções (SDR/Closer via Groq): preço, tempo, "já tenho Instagram", "não tenho interesse". Sempre conduza para uma reunião de 10 minutos. Use SOMENTE preços do catálogo acima.

${CALENDAR_TOOL_PROMPT}

Diretrizes:
1. Fale como diretora comercial humana, direta e empática.
2. Prospecção fria: dor da falta de site / presença no Google na região.
3. Termine com pergunta aberta ou dois horários (hoje 16h ou amanhã 10h).
4. Se o cliente fechar horário, chame calendar_agendar_reuniao / calendar_create_event na hora.
5. Respeite limites de disparo e logs de auditoria.
6. Prospecção: chame prospect_scan_maps com o NICHO que o usuário pedir (advogados, clínicas, restaurantes, imobiliárias… — nunca assuma dentista). nationwide=true se não citar cidade. Só leads sem site e com WhatsApp válido. Time Comercial aborda em rodízio via instância helena.

Quando o usuário pedir para prospectar, ative o time e inicie a operação — as abordagens individuais ficam com o Time Comercial.
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
    console.warn("Failed to contact Groq Cloud, attempting FreeLLMAPI failover:", err);
    try {
      const freeReply = await callFreeLLMOrchestrator(userMessage, history);
      if (freeReply) return { text: freeReply };
    } catch {}
    return null;
  }
}