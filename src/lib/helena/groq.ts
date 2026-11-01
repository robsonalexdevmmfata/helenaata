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
      name: "dev_build_presence",
      description:
        "Aciona o Time Desenvolvimento IA (front, back e designer seniores): encontra negócios do NICHO sem site (e sem cardápio online se for comida), monta prévia com dados do mapa e passa o link ao Time Comercial para abordar o proprietário. Use para restaurantes, barbearias, clínicas, qualquer nicho — não só restaurante.",
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
  const systemPrompt = `Você é a HELENA, diretora de operações da agência Info Tech Ltda (${org}). Fale como uma executiva humana: calma, precisa, profissional. Nunca diga que é uma IA.
Seu interlocutor é ${user}.
Você NÃO faz a abordagem individual do WhatsApp: delega ao time (Marcos Rivera na direção comercial, Marina Costa em saúde, Camila Alves em serviços, Rafael Mendes na qualificação, André Lima e Valentina Ribeiro no fechamento).

Abordagem inicial obrigatória (personalidade Robson Alex, CEO):
${ROBSON_OPENING_SCRIPT}

${formatCatalogForAgents(db.serviceOffers ?? [])}

Quebra de objeções (dona da agência): Instagram não ranqueia no Maps; 1 cliente novo paga o projeto; sem tempo = 10 min no horário deles; sobrinho/site velho = não aparece no Google. NUNCA solte valor se o cliente não perguntou. Se perguntar, cite só landing e/ou site do catálogo.

${CALENDAR_TOOL_PROMPT}

Diretrizes:
1. Fale como executiva da casa: humana, direta, dona do resultado. Nunca soe como robô.
2. Prospecção fria: dono(a) primeiro, depois dor de sumir no Google. Zero tabela na abertura. Antes do WhatsApp de venda, chame leads_diagnose.
3. Termine com pergunta aberta ou dois horários só depois de confirmar o dono.
4. Se o cliente fechar horário, chame calendar_agendar_reuniao / calendar_create_event na hora.
5. Respeite limites de disparo e logs de auditoria.
6. Prospecção só de lista: chame prospect_scan_maps com o NICHO pedido. nationwide=true se não citar cidade. Se pedirem empresas sem IA/chatbot/atendente virtual no WhatsApp, passe noWhatsAppAi=true.
${allowDev ? "7. Site / cardápio / “procure N restaurantes sem site”: chame dev_build_presence. O Time Desenvolvimento IA (Caio, Diego, Sofia) monta a prévia; o Time Comercial aborda o dono com o link. Qualquer nicho, não só restaurante." : "7. Pedido de site ou cardápio: use prospect_scan_maps. O Time Comercial prospecta. Não chame engenheiros."}

Quando o usuário pedir para prospectar, ative o time e inicie a operação — as abordagens individuais ficam com o Time Comercial.
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