// Groq Cloud & FreeLLMAPI Integration for HELENA AI Orchestrator
import { currentUser, getDB } from "@/lib/store";
import { canUseDevTeam } from "@/lib/saas";
import { callFreeLLMOrchestrator, getFreeLLMConfig } from "./freellmapi";
import { CALENDAR_TOOL_PROMPT, ROBSON_OPENING_SCRIPT } from "./calendar";
import { formatCatalogForAgents } from "@/lib/catalog";
import { serverChatCompletion } from "@/lib/backend";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export function getGroqApiKey(): string {
  if (typeof window !== "undefined") return "";
  if (typeof process !== "undefined" && process.env?.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY;
  }
  return "";
}

export function getGroqModel(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_GROQ_MODEL) {
    return import.meta.env.VITE_GROQ_MODEL;
  }
  // Llama 3.3 70B: melhor pra texto comercial + instrução de produto (cardápio vs site).
  return "llama-3.3-70b-versatile";
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
      name: "dev_build_presence",
      description:
        "Time Dev (Caio/Diego/Sofia): monta prévia na Vercel. CARDÁPIO só pra restaurante/lanchonete/pizzaria/hamburguer/churrascaria. Sorveteria, açaí, padaria, barbearia, chaveiro etc. = SITE (sem cardápio de pratos). Depois o comercial manda o link.",
      parameters: {
        type: "object",
        properties: {
          segment: { type: "string", description: "Nicho (ex: Restaurantes, Barbearias, Advogados)" },
          city: { type: "string", description: "Cidade e UF, ou Brasil" },
          nationwide: { type: "boolean" },
          limit: { type: "number", description: "Quantidade (padrão 10, máx 50)" },
        },
        required: ["segment"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prospect_scan_maps",
      description:
        "Varredura nacional (OpenStreetMap + FreeLLMAPI) de negócios COM WhatsApp válido. Padrão: SEM site (#sem-site). Se o pedido for empresas sem IA/chatbot no WhatsApp, use noWhatsAppAi=true (#sem-ia-whatsapp). Dispara o Time Comercial.",
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
          noWhatsAppAi: {
            type: "boolean",
            description: "true = filtrar quem provavelmente NÃO tem IA/chatbot no WhatsApp (sem site ou site sem Blip/Zenvia/Jivo/etc.)",
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
      name: "leads_diagnose",
      description: "Diagnostica um lead com score 0–100, evidências (sem site, cardápio, fotos, WhatsApp) e oferta recomendada. Chame antes de disparar WhatsApp de venda.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "ID do contato no CRM" },
        },
        required: ["contactId"],
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
      name: "helena_briefing",
      description: "Briefing da empresa com dados reais do cadastro: o que aconteceu, o que está acontecendo, riscos e próxima ação. Sem previsão inventada.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "helena_coach",
      description: "Ensina a usar o sistema (WhatsApp, Caçar Leads, Pipeline, Inbox, follow-up, prévia Vercel). Use quando pedirem como usar, tutorial, por onde começar ou o que fazer.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string", description: "whatsapp | pipeline | followup | site | geral" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "helena_run_followups",
      description: "Helena assume follow-up: ativa Lucas/Valentina/SDRs, resgata frios >48h e agenda retornos. Use quando pedirem cuidar de follow-up ou administrar tudo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "helena_council",
      description: "Pede pareceres independentes do Comercial, Operações, Desenvolvimento (se liberado) e Qualidade. Helena orquestra; não cria departamentos fictícios.",
      parameters: {
        type: "object",
        properties: { objective: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "helena_crisis",
      description: "Avalia se há crise real (WhatsApp offline, RPA falho, kill switch) e devolve um plano. Sem teatro.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "missions_plan",
      description: "Planeja uma missão comercial rastreável (radar → abordagem → BANT → agenda → proposta). Não dispara WhatsApp sozinha.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string" },
          targetValue: { type: "number" },
        },
        required: ["objective"],
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

function parseChoice(choice: any): GroqResponse {
  const toolCalls: GroqToolCall[] = [];
  if (choice.tool_calls && Array.isArray(choice.tool_calls)) {
    for (const tc of choice.tool_calls) {
      try {
        toolCalls.push({ id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments || "{}") });
      } catch {
        // ignore argument parse error
      }
    }
  }
  return { text: choice.content || "", toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
}

export async function callGroqOrchestrator(
  userMessage: string,
  history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [],
): Promise<GroqResponse | null> {
  const apiKey = getGroqApiKey();

  const db = getDB();
  const org = db.organization.name;
  const user = db.users.find((u) => u.id === db.currentUserId)?.name || "Gestor";

  const allowDev = canUseDevTeam(currentUser(db));
  const tools = allowDev ? GROQ_TOOLS : GROQ_TOOLS.filter((t) => t.function.name !== "dev_build_presence");
  const systemPrompt = `Você é a HELENA — sistema operacional desta conta (${org}). Você ENSINA a usar o painel, ADMINISTRA a operação e CUIDA do follow-up. Fale como executiva humana: calma, precisa. Nunca diga que é uma IA.
Interlocutor: ${user}.

Você orquestra; o WhatsApp individual fica com o time (Marcos Rivera, Marina Costa, Camila Alves, Rafael Mendes, André Lima, Valentina Ribeiro, Lucas no follow-up). Site/cardápio oficiais: R$ 100/mês com front público na Vercel (Time Dev).

Abordagem Robson Alex (abertura comercial):
${ROBSON_OPENING_SCRIPT}

${formatCatalogForAgents(db.serviceOffers ?? [])}

${CALENDAR_TOOL_PROMPT}

Diretrizes:
1. Se perguntarem como usar / o que fazer / me ensina: chame helena_coach.
2. Se pedirem follow-up, cuidar de tudo, resgatar frios: chame helena_run_followups.
3. Prospecção / RPA / 1000 leads / diversos nichos / Brasil: SEMPRE prospect_scan_maps primeiro (nationwide=true, wave). NUNCA chame só dev_build_presence nesse pedido — cardápio/site/time Dev vêm DEPOIS dos leads.
4. Antes de venda no WhatsApp, leads_diagnose. Dono primeiro; preço só se perguntarem (site/cardápio R$ 100/mês).
5. Horário fechado → calendar_agendar_reuniao na hora.
${allowDev ? "6. Prévia Vercel pura (sem RPA): dev_build_presence. Cardápio = só restaurante/lanchonete. Sorveteria e serviços = site. Se misturar prospecção+Dev, chame só prospect_scan_maps." : "6. Sem Time Dev liberado: prospect_scan_maps; comercial prospecta."}
7. Você é dona do resultado: ensina o próximo clique, dispara o time e acompanha follow-up. Não empurre o usuário a clicar menu a menu se puder fazer por tool.

Responda sempre em Português do Brasil.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6),
    { role: "user", content: userMessage },
  ];

  if (!apiKey) {
    // Sem chave no navegador: usa a IA do servidor (chave fica guardada lá).
    const viaServer = await serverChatCompletion({ messages, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 1024 });
    const serverChoice = viaServer?.choices?.[0]?.message;
    if (serverChoice) return parseChoice(serverChoice);
    const freeConfig = getFreeLLMConfig();
    if (freeConfig.enabled) {
      const freeReply = await callFreeLLMOrchestrator(userMessage, history);
      if (freeReply) return { text: freeReply };
    }
    return null;
  }

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
        tools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) return null;
    return parseChoice(choice);
  } catch (err) {
    /* failover silencioso */
    try {
      const freeReply = await callFreeLLMOrchestrator(userMessage, history);
      if (freeReply) return { text: freeReply };
    } catch {}
    return null;
  }
}