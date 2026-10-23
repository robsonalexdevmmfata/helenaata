// Helena Orchestrator (frontend mock).
// Flow: message -> intent -> context -> plan -> tool selection -> risk check ->
// approval when needed -> execution -> monitoring -> result.
// Intent detection is rule-based here; swap interpret() for an LLM call with
// tool calling when the real backend exists. The execution path stays the same.
import type { Agent, DB, HelenaCard } from "@/lib/types";
import { createUiStore, currentUser, getDB } from "@/lib/store";
import { brl, greeting, normalize, pct } from "@/lib/format";
import { computeSummary, needsApproval, pushHelenaMessage, requestApproval, runTool, toolRisk, updateHelenaCard } from "./engine";
import { getToolDef } from "./registry";
import { callGroqOrchestrator } from "./groq";
import { computeDynamicCadence, getWhatsAppWorkerStatus, OBJECTION_MATRIX, FINANCIAL_GOAL } from "./sales-brain";
import { computeRevenuePlan, parseDeadline, parseRevenueGoal } from "./revenue-goal";

export type HelenaState = "ocioso" | "ouvindo" | "pensando" | "planejando" | "executando" | "aguardando" | "concluindo";

export const helenaUi = createUiStore<{ open: boolean; state: HelenaState; draft: string; paletteOpen: boolean }>({
  open: false,
  state: "ocioso",
  draft: "",
  paletteOpen: false,
});

export const HELENA_STATE_LABEL: Record<HelenaState, string> = {
  ocioso: "Online",
  ouvindo: "Ouvindo",
  pensando: "Pensando",
  planejando: "Planejando",
  executando: "Executando",
  aguardando: "Aguardando aprovação",
  concluindo: "Concluindo",
};

interface Reply {
  text: string;
  card?: HelenaCard;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function openHelena(prefill?: string) {
  helenaUi.set({ open: true, paletteOpen: false, ...(prefill !== undefined ? { draft: prefill } : {}) });
}

export async function sendToHelena(text: string) {
  const clean = text.trim();
  if (!clean) return;
  pushHelenaMessage(clean, undefined, "user");
  helenaUi.set({ state: "pensando", draft: "" });

  const history = getDB().helenaMessages.slice(-6).map((m) => ({
    role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));

  // Orquestração inteligente via Groq Cloud
  // Revenue goals always use the deterministic plan so the math and approval card are guaranteed.
  const groqRes = parseRevenueGoal(clean) ? null : await callGroqOrchestrator(clean, history);

  if (groqRes && groqRes.toolCalls && groqRes.toolCalls.length > 0) {
    helenaUi.set({ state: "planejando" });
    await sleep(350);

    const user = currentUser(getDB());
    for (const tc of groqRes.toolCalls) {
      if (tc.name === "prospect_scan_maps") {
        const res = runTool("prospect.scan_maps", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy: user.name });
        pushHelenaMessage(
          groqRes.text || `Executei a varredura no Google Maps para ${tc.arguments.segment || "empresas"} em ${tc.arguments.city || "São Paulo"}. Encontrei empresas sem site e injetei no CRM com a tag #sem-site. O SDR já iniciou a abordagem!`,
          { type: "result", ok: res.ok, title: "Varredura Google Maps (#sem-site)", detail: res.message }
        );
      } else if (tc.name === "calendar_create_event") {
        const res = runTool("calendar.create_event", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy: user.name });
        pushHelenaMessage(
          groqRes.text || "Reunião agendada no Google Calendar / Cal.com e vinculada ao lead no pipeline!",
          { type: "result", ok: res.ok, title: "Google Calendar / Cal.com", detail: res.message }
        );
      } else if (tc.name === "sales_handle_objection") {
        const res = runTool("sales.handle_objection", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy: user.name });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Matriz de Objeções (Sales Brain)", detail: res.message }
        );
      } else if (tc.name === "sales_generate_checkout_pix") {
        const res = runTool("sales.generate_checkout_pix", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy: user.name });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Checkout Pix / Fechamento", detail: res.message }
        );
      } else if (tc.name === "sales_rescue_cold_leads") {
        const res = runTool("sales.rescue_cold_leads", tc.arguments, { actor: "Helena", actorType: "helena", requestedBy: user.name });
        pushHelenaMessage(
          groqRes.text || res.message,
          { type: "result", ok: res.ok, title: "Resgate de Leads Frios (>48h)", detail: res.message }
        );
      } else {
        const replies = interpret(clean);
        replies.forEach((r) => pushHelenaMessage(r.text, r.card));
      }
    }
    helenaUi.set({ state: "concluindo" });
    await sleep(600);
    helenaUi.set({ state: "ocioso" });
    return;
  } else if (groqRes && groqRes.text && groqRes.text.length > 10) {
    helenaUi.set({ state: "planejando" });
    await sleep(350);
    pushHelenaMessage(groqRes.text);
    helenaUi.set({ state: "concluindo" });
    await sleep(600);
    helenaUi.set({ state: "ocioso" });
    return;
  }

  // Fallback determinístico
  await sleep(400);
  helenaUi.set({ state: "planejando" });
  await sleep(350);
  const replies = interpret(clean);
  replies.forEach((r) => pushHelenaMessage(r.text, r.card));
  const waiting = replies.some((r) => r.card?.type === "plan" || r.card?.type === "approval" || r.card?.type === "agent_proposal");
  helenaUi.set({ state: waiting ? "aguardando" : "concluindo" });
  if (!waiting) {
    await sleep(800);
    helenaUi.set({ state: "ocioso" });
  }
}

function prepSdr(n: string) {
  return n.replace(/sdr\s*-?\s*0?(\d)/g, "sdr 0$1");
}

function findAgents(db: DB, n: string): Agent[] {
  const exact = db.agents.filter((a) => n.includes(normalize(a.name)));
  if (exact.length) return exact.sort((a, b) => b.name.length - a.name.length).slice(0, 1);
  return db.agents.filter((a) => n.includes(normalize(a.role)));
}

/** Run a tool now, or create an approval request when its risk level requires it. */
function perform(tool: string, params: Record<string, unknown>, title: string, details: { label: string; value: string }[], okText: string): Reply {
  const db = getDB();
  const risk = toolRisk(db, tool);
  if (needsApproval(db, tool)) {
    const approvalId = requestApproval({ title, description: getToolDef(tool)?.description ?? "", details, tool, params, risk, requestedBy: "Helena" });
    return { text: `Posso fazer isso. Como é uma ação de risco ${risk === "alto" ? "alto" : "médio"}, preciso da sua aprovação antes de executar.`, card: { type: "approval", approvalId } };
  }
  const user = currentUser(db);
  const res = runTool(tool, params, { actor: "Helena", actorType: "helena", requestedBy: user.name });
  return res.ok
    ? { text: okText, card: { type: "result", ok: true, title, detail: res.message } }
    : { text: `Não consegui concluir porque ${res.message}. Nada foi alterado.`, card: { type: "result", ok: false, title, detail: res.message } };
}

function planOperation(opts: { intro: string; title: string; objective: string; total: number; listId: string; agentIds: string[]; suggestions: string[] }): Reply[] {
  const db = getDB();
  const conn = db.connections.find((c) => c.status === "online") ?? db.connections[0] ?? {
    id: "wa1",
    name: "WhatsApp Local",
    status: "online",
  };

  const list = db.lists.find((l) => l.id === opts.listId) ?? db.lists[0];
  const names = db.agents.filter((a) => opts.agentIds.includes(a.id)).map((a) => a.name);
  const approvalId = requestApproval({
    title: opts.title,
    description: opts.objective,
    details: [
      { label: "Contatos", value: String(opts.total) },
      { label: "Lista", value: list.name },
      { label: "Canal", value: conn.name },
      { label: "Agentes", value: names.join(", ") },
      { label: "Limite", value: `${opts.total} mensagens` },
    ],
    tool: "operations.start",
    params: { title: opts.title, objective: opts.objective, total: opts.total, agentIds: opts.agentIds, listId: list.id, connectionId: conn.id },
    risk: "alto",
    requestedBy: "Helena",
  });
  return [
    {
      text: `${opts.intro}\n\nMinha sugestão:\n${opts.suggestions.map((s) => `• ${s}`).join("\n")}\n\nEstimativa inicial: ${opts.total} contatos.\n\nDeseja que eu execute?`,
      card: {
        type: "plan",
        title: opts.title,
        approvalId,
        steps: [
          { label: "Carregar ICP", done: true },
          { label: `Selecionar ${names.filter((n) => n.startsWith("SDR")).join(" e ") || "agentes"}`, done: true },
          { label: `Preparar lista ${list.name}`, done: true },
          { label: "Iniciar prospecção", done: false },
          { label: "Monitorar respostas", done: false },
          { label: "Qualificar oportunidades", done: false },
        ],
      },
    },
  ];
}

export function interpret(text: string): Reply[] {
  const db = getDB();
  const user = currentUser(db);
  const first = user.name.split(" ")[0];
  const n = prepSdr(normalize(text));
  const summary = computeSummary(db);
  const comercial = db.teams.find((t) => t.name === "Comercial")!;
  const sdrs = db.agents.filter((a) => a.role === "SDR" && a.status !== "erro");

  if (!db.rolePermissions[user.role]?.includes("helena.use")) {
    return [{ text: "Seu perfil não tem permissão para usar a Helena. Fale com um administrador." }];
  }

  // Create agent
  if (/\b(crie|criar|cria|monte|montar|preciso de)\b.*\b(sdr|agente|closer|atendente|qualificador|follow.?up)\b/.test(n) && !/estrategia/.test(n)) {
    const role = /closer/.test(n) ? "Closer" : /atendente|atendimento/.test(n) ? "Atendimento" : /qualificador/.test(n) ? "Qualificador" : /follow/.test(n) ? "Follow-up" : "SDR";
    const segMatch = text.match(/para\s+(.+?)[.?!]*$/i);
    const segment = segMatch ? segMatch[1].replace(/^(as|os|a|o)\s+/i, "") : "novos clientes";
    const segTitle = segment.split(" ").slice(-1)[0].replace(/^\w/, (c) => c.toUpperCase());
    const isAt = role === "Atendimento";
    return [{
      text: `Montei uma proposta de agente. Revise e, se estiver de acordo, eu crio.`,
      card: {
        type: "agent_proposal",
        proposal: {
          name: `${role} ${segTitle}`,
          role,
          objective: role === "SDR" ? `Prospectar ${segment} sem presença digital adequada.` : `Atuar como ${role.toLowerCase()} para ${segment}.`,
          tools: ["crm.search_contacts", "crm.create_contact", "messages.send", "knowledge.search", "crm.create_lead", "crm.move_lead"],
          channels: ["whatsapp"],
          model: db.helenaSettings.agentsDefaultModel,
          supervisorId: isAt ? "a_supat" : "a_supcom",
          teamId: isAt ? "t_at" : "t_com",
        },
      },
    }];
  }

  // Google Maps Scraper (#sem-site)
  if (/sem.?site|google maps|maps|varr\w*|prospect\w*.*site/.test(n)) {
    const segMatch = n.match(/(cl[ií]nica[s]?|odontolog\w*|est[eé]tica|barbearia[s]?|restaurante[s]?|com[eé]rcio[s]?|ag[eê]ncia[s]?)/i);
    const segment = segMatch ? segMatch[0].replace(/^\w/, (c) => c.toUpperCase()) : "Clínicas odontológicas";
    const cityMatch = text.match(/(em|de)\s+([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõ]+)*(?:,\s*[A-Z]{2})?)/i);
    const city = cityMatch ? cityMatch[2] : "São Paulo, SP";
    const limit = Number(n.match(/(\d{1,3})/)?.[1] ?? 10);

    return [
      perform(
        "prospect.scan_maps",
        { segment, city, limit },
        `Varredura Google Maps: ${segment} em ${city}`,
        [
          { label: "Segmento", value: segment },
          { label: "Cidade", value: city },
          { label: "Critério", value: "Negócios sem site (#sem-site)" },
          { label: "Agente responsável", value: "SDR 01" },
        ],
        `Executei a varredura do Google Maps em ${city} para ${segment}. Encontrei ${limit} empresas operando sem site oficial. Já cadastrei as empresas e contatos no CRM com a tag #sem-site, criei as oportunidades no Pipeline Comercial e o SDR 01 já disparou a primeira abordagem consultiva via WhatsApp!`
      ),
    ];
  }

  // Agendamento no Google Calendar / Cal.com
  if (/agend\w*|marcar.*reuni[aã]o|cal\.com|calendar/.test(n) && !/consiga/.test(n)) {
    const contact = db.contacts.find((c) => n.includes(normalize(c.name))) || db.contacts[0];
    const deal = db.deals.find((d) => d.contactId === contact?.id);
    return [
      perform(
        "calendar.create_event",
        {
          contactId: contact?.id,
          dealId: deal?.id,
          title: `Apresentação de Site Institucional · ${contact?.name || "Cliente"}`,
        },
        `Agendar reunião: ${contact?.name}`,
        [
          { label: "Cliente", value: contact?.name || "Cliente" },
          { label: "Canal", value: "Google Calendar & Cal.com" },
          { label: "Responsável", value: "Closer (IA)" },
        ],
        `Reunião agendada com sucesso no Google Calendar e Cal.com para ${contact?.name}! O convite com link de videoconferência foi gerado e o lead foi movido para a etapa de Reunião Agendada no pipeline.`
      ),
    ];
  }

  // Revenue goal (Jarvis executiva): "precisamos faturar R$ 15.000 esta semana"
  const revenueGoal = parseRevenueGoal(text);
  if (revenueGoal) {
    const plan = computeRevenuePlan(revenueGoal, {}, parseDeadline(text));
    const sdrNames = sdrs.map((a) => a.name).join(" e ") || "SDR 01 e SDR 02";
    const perSdr = Math.ceil(plan.leads / Math.max(1, sdrs.length));
    return planOperation({
      intro: `${greeting()}, ${first}. Meta recebida: ${brl(plan.goal)} ${plan.deadline}.\n\nMatemática de vendas da ${db.organization.name}:\n• Ticket médio site/sistema: ${brl(plan.ticket)} → ${plan.sales} clientes fechados\n• Conversão do Closer: ${Math.round(plan.closeRate * 100)}% → ${plan.meetings} reuniões agendadas\n• Agendamento dos SDRs: ${Math.round(plan.meetingRate * 100)}% → ${plan.leads} leads abordados`,
      title: `Meta ${brl(plan.goal)} · ${plan.deadline}`,
      objective: `Faturar ${brl(plan.goal)} ${plan.deadline}: abordar ${plan.leads} leads sem site, agendar ${plan.meetings} reuniões e fechar ${plan.sales} vendas.`,
      total: plan.leads,
      listId: "l2",
      agentIds: [...sdrs.map((a) => a.id), "a_qual", "a_closer", "a_supcom"],
      suggestions: [
        `Caçador / Scraper: filtrar ${plan.leads} leads da região sem site no Google Maps (#sem-site)`,
        `${sdrNames}: disparar abordagens pelo WhatsApp de forma espaçada (~${perSdr} por SDR, evitando bloqueios)`,
        `Qualificador: de prontidão para agendar no Google Calendar / Cal.com assim que o dono responder "Sim, quero ver a demonstração"`,
        `Closer: conduzir as ${plan.meetings} reuniões com meta de ${plan.sales} fechamentos`,
        "Supervisor Comercial: acompanhar o funil e me alertar se a taxa de resposta cair",
      ],
    });
  }

  // 1. Gestão Dinâmica da Meta de R$ 15.000,00 (Dynamic Cadence)
  if (/15\s*k|15000|15\.000|cadencia dinamica|ritmo de vendas|meta financeira/.test(n)) {
    const cad = computeDynamicCadence(db);
    return [{
      text: `📊 Gestão Dinâmica da Meta de R$ 15.000,00 (Info Tech Ltda):\n\n• Faturamento acumulado: ${brl(cad.achieved)} de ${brl(cad.goal)} (${cad.percent}% da meta)\n• Pipeline em aberto: ${brl(cad.openPipelineValue)}\n• Ritmo Atual: ${cad.pacingStatus === "turbo" ? "⚡ TURBO (Acelerado automaticamente para recuperar ritmo)" : "✅ NORMAL (Ritmo sustentável)"}\n• Cadência Diária Recomendada: ${cad.dailyTargetCadence} abordagens/dia por SDR\n• Oportunidades paradas > 48h: ${cad.staleDealsCount} leads\n\n${cad.pacingStatus === "turbo" ? "Como o faturamento está abaixo da meta semanal, dobrei a cadência diária dos SDRs de 30 para 60 abordagens/dia para garantir o atingimento dos R$ 15.000,00!" : "Estamos no caminho certo para fechar os R$ 15.000,00 do mês!"}`,
      card: {
        type: "stats",
        title: "Cadência Dinâmica · Meta R$ 15.000,00",
        items: [
          { label: "Meta Mensal", value: brl(cad.goal) },
          { label: "Faturado Ganho", value: brl(cad.achieved), hint: `${cad.percent}% alcançado` },
          { label: "Ritmo Operacional", value: cad.pacingStatus.toUpperCase(), hint: `${cad.dailyTargetCadence} abordagens/dia` },
          { label: "Leads Parados (>48h)", value: String(cad.staleDealsCount), hint: "Elegíveis para resgate" },
        ],
      },
    }];
  }

  // 2. Resgate de Leads Frios (> 48h)
  if (/resgat\w*|leads? parados?|leads? frios?|destravar oportunidade/.test(n)) {
    const cad = computeDynamicCadence(db);
    return [
      perform(
        "sales.rescue_cold_leads",
        {},
        "Resgate de Leads Frios (>48h parados)",
        [
          { label: "Critério", value: "Leads sem interação há mais de 48h no Kanban" },
          { label: "Oferta", value: "Condição especial de parcelamento + liberação de domínio" },
          { label: "Total elegível", value: `${cad.staleDealsCount} oportunidades` },
        ],
        `⚡ HELENA ativou o motor de resgate comercial! As oportunidades paradas há mais de 48h receberam mensagens personalizadas com a condição especial de parcelamento da Info Tech Ltda.`
      ),
    ];
  }

  // 3. Matriz de Objeções (Sales Brain)
  if (/obje[cç][aã]o|matriz de obje|contornar obje/.test(n)) {
    return [{
      text: `🧠 Matriz de Objeções Ativa (Sales Brain da Helena):\n\n1. "Já tenho Instagram, não preciso de site" → Envia print demonstrativo e alerta que 80% das buscas com urgência ocorrem no Google Maps.\n2. "Quanto custa?" → Não dá preço solto: oferece prévia demonstrativa e propõe 2 opções de horário (hoje às 16h ou amanhã às 10h).\n3. "Agora não posso conversar" → Compreende a rotina e agenda follow-up automático para as 10h ou 17h do dia seguinte.\n4. "Achei caro" → Demonstra que apenas 1 novo cliente por mês já paga todo o investimento do site.\n5. "Não tenho interesse" → Finaliza com cortesia e agenda reaquecimento em 45 dias.`,
      card: {
        type: "list",
        title: "Matriz de Objeções Comerciais · Info Tech Ltda",
        items: OBJECTION_MATRIX.map((obj) => ({
          label: obj.title,
          sub: `Ação autônoma: ${obj.actionDescription}`,
        })),
      },
    }];
  }

  // 4. Arquitetura WhatsApp & 24/7 (Sem abas / Baileys / Oracle Cloud)
  if (/aba[s]?|sem reload|baileys|socket|onde deixar rodando|oracle cloud|nuvem gratis/.test(n)) {
    const ws = getWhatsAppWorkerStatus(db);
    return [{
      text: `🔌 Arquitetura WhatsApp da Helena (Socket Invisível em Segundo Plano):\n\n• Zero Abas de Navegador: Não usamos Chrome nem interface visual pesada. Usamos a biblioteca de Socket/API em segundo plano (@whiskeysockets/baileys).\n• Consumo de Recursos: Apenas ~${ws.ramUsageMb}MB de RAM (contra mais de 1GB de abas Chrome).\n• Pareamento Simples: Você lê o QR Code apenas uma vez no celular do chip de prospecção. Depois de conectado, o celular pode ficar no carregador com Wi-Fi/4G enquanto o motor invisível opera.\n• Onde deixar rodando 24/7 sem travar seu PC de trabalho?\n  1. Opção Grátis (PC/Notebook parado em casa no carregador rodando Node.js);\n  2. Opção Nuvem Grátis (Oracle Cloud Free Tier - VM Linux 100% gratuita para sempre com PM2).`,
      card: {
        type: "stats",
        title: "Status do Worker WhatsApp (Socket Baileys)",
        items: [
          { label: "Arquitetura", value: "Socket / Background" },
          { label: "Consumo RAM", value: `${ws.ramUsageMb} MB`, hint: "Leve e sem abas Chrome" },
          { label: "Status Conexão", value: ws.status },
          { label: "Hospedagem Recomendada", value: "Oracle Cloud Free Tier" },
        ],
      },
    }];
  }${plan.meetings} reuniões com meta de ${plan.sales} fechamentos`,
        "Supervisor Comercial: acompanhar o funil e me alertar se a taxa de resposta cair",
      ],
    });
>>>>>>> be495da4cf79feca20b3d19e95de36d1168e5e25
  }

  // Strategy
  if (/estrategia|quero vender|bater a meta/.test(n)) {
    const target = Number(n.match(/(\d{1,4})/)?.[1] ?? 10);
    const won = db.deals.filter((d) => d.status === "ganho");
    const ticket = won.length ? won.reduce((s, d) => s + d.value, 0) / won.length : 5000;
    const closeRate = 0.3;
    const meetingRate = 0.05;
    const meetings = Math.ceil(target / closeRate);
    const contacts = Math.min(500, Math.ceil(meetings / meetingRate));
    return planOperation({
      intro: `Para vender ${target} sites este mês, com ticket médio de ${brl(ticket)} (receita estimada de ${brl(ticket * target)}), considerando 30% de fechamento por reunião e 5% de reunião por contato, precisamos de cerca de ${meetings} reuniões e ${contacts} contatos.`,
      title: `Meta ${target} sites`,
      objective: `Gerar ${meetings} reuniões para fechar ${target} sites.`,
      total: contacts,
      listId: "l2",
      agentIds: [...sdrs.map((a) => a.id), "a_qual", "a_closer"],
      suggestions: [
        `dividir ${contacts} contatos entre ${sdrs.map((a) => a.name).join(" e ")}`,
        "começar pelas listas Clínicas SP e Empresas SP",
        "usar a cadência B2B padrão (5 toques)",
        "encaminhar interessados para o Qualificador e depois para o Closer",
        `acompanhar diariamente a meta de ${Math.ceil(meetings / 20)} reuniões por dia útil`,
      ],
    });
  }

  // Prospecting / activate commercial or marketing team
  if (/prospect|potenciais clientes|novos clientes|consiga reunioes|conseguir reunioes|ativ\w*.*(comercial|marketing|time|sdr|agentes)/.test(n)) {
    const listId = /clinic|consultori|dentist/.test(n) ? "l2" : /imobili/.test(n) ? "l4" : "l1";
    const list = db.lists.find((l) => l.id === listId) ?? db.lists[0];
    const total = Number(n.match(/(\d{1,4})/)?.[1] ?? 50);
    const teamMention = /marketing/.test(n) ? "Comercial e Marketing" : "Comercial";
    const agentCount = comercial?.agentIds?.length ?? 3;
    const orgName = /info\s*tech/i.test(text) ? "Info Tech Ltda" : db.organization.name;
    return planOperation({
      intro: `${greeting()}. Posso iniciar.\n\nEncontrei o time ${teamMention} com ${agentCount} agentes disponíveis para a ${orgName}.`,
      title: `Prospecção ${list.name}`,
      objective: `Prospectar ${total} contatos da lista ${list.name} para a ${orgName} e gerar reuniões.`,
      total,
      listId: list.id,
      agentIds: [...sdrs.map((a) => a.id), "a_qual", "a_closer"],
      suggestions: [
        `ativar ${sdrs.map((a) => a.name).join(" e ")}`,
        `utilizar a lista ${list.name}`,
        `priorizar ${list.segment.toLowerCase()}`,
        `iniciar com ${total} contatos`,
        "interromper automaticamente respostas negativas",
        "encaminhar interessados para o agente Closer",
        "criar os leads no pipeline Comercial",
      ],
    });
  }

  // Pause
  if (/\b(pause|pausar|pare|parar|desative|desativar|interrompa|suspenda)\b/.test(n)) {
    if (/campanha/.test(n)) {
      const camp = db.campaigns.find((c) => c.status === "ativa");
      if (!camp) return [{ text: "Não encontrei nenhuma campanha ativa para pausar." }];
      return [perform("campaigns.pause", { campaignId: camp.id }, `Pausar campanha ${camp.name}`, [{ label: "Campanha", value: camp.name }], `Pausei a campanha ${camp.name}. Os envios pendentes foram interrompidos.`)];
    }
    if (/operac/.test(n)) {
      const op = db.operations.find((o) => o.status === "running");
      if (!op) return [{ text: "Não há operações em execução no momento." }];
      return [perform("operations.pause", { operationId: op.id }, `Pausar ${op.code}`, [{ label: "Operação", value: op.title }], `Pausei a operação ${op.code} · ${op.title}.`)];
    }
    const team = db.teams.find((t) => n.includes(`time ${normalize(t.name)}`) || n.includes(`o ${normalize(t.name)}`));
    if (team && !findAgents(db, n).length) {
      return [perform("teams.pause", { teamId: team.id }, `Pausar time ${team.name}`, [{ label: "Agentes", value: String(team.agentIds.length + 1) }], `Pausei o time ${team.name} e todos os seus agentes.`)];
    }
    const found = findAgents(db, n);
    if (found.length === 1) {
      const a = found[0];
      return [perform("agents.pause", { agentId: a.id }, `Pausar ${a.name}`, [{ label: "Agente", value: a.name }, { label: "Tarefa atual", value: a.currentTask || "—" }], `${a.name} foi pausado. Ele não iniciará novos contatos até ser reativado.`)];
    }
    if (found.length > 1) {
      return [{ text: `Encontrei ${found.length} agentes com essa função: ${found.map((a) => a.name).join(", ")}. Qual deles devo pausar? Ex.: "pause o ${found[0].name}".` }];
    }
    return [{ text: "Não identifiquei qual agente, time, campanha ou operação devo pausar. Nada foi alterado." }];
  }

  // Activate
  if (/\b(ative|ativar|reative|reativar|retome|retomar|ligue|coloque para trabalhar)\b/.test(n)) {
    if (/operac/.test(n)) {
      const op = db.operations.find((o) => o.status === "paused");
      if (!op) return [{ text: "Não há operações pausadas para retomar." }];
      return [perform("operations.resume", { operationId: op.id }, `Retomar ${op.code}`, [{ label: "Operação", value: op.title }], `Retomei a operação ${op.code}.`)];
    }
    const found = findAgents(db, n);
    if (found.length === 1) {
      const a = found[0];
      return [perform("agents.activate", { agentId: a.id }, `Ativar ${a.name}`, [{ label: "Agente", value: a.name }], `${a.name} está ativo e trabalhando.`)];
    }
    const team = db.teams.find((t) => n.includes(normalize(t.name)));
    if (team) return [perform("teams.activate", { teamId: team.id }, `Ativar time ${team.name}`, [{ label: "Agentes", value: String(team.agentIds.length + 1) }], `O time ${team.name} está ativo.`)];
    if (found.length > 1) return [{ text: `Encontrei ${found.map((a) => a.name).join(", ")}. Qual deles devo ativar?` }];
  }

  // Hand interested leads to closer
  if (/closer/.test(n) && /(passe|passar|encaminhe|encaminhar|transfira|mande)/.test(n)) {
    const deals = db.deals.filter((d) => d.status === "aberto" && ["st_qual", "st_reun"].includes(d.stageId) && d.ownerId !== "a_closer");
    if (!deals.length) return [{ text: "Não há leads interessados pendentes de encaminhamento ao Closer." }];
    return [perform("crm.assign_lead", { dealIds: deals.map((d) => d.id), ownerId: "a_closer", ownerType: "agent" }, `Encaminhar ${deals.length} leads ao Closer`, [{ label: "Leads", value: deals.map((d) => d.title).slice(0, 4).join(", ") + (deals.length > 4 ? "…" : "") }], `Encaminhei ${deals.length} leads qualificados para o Closer. O handoff foi registrado na timeline de cada cliente.`)];
  }

  // Follow-up
  if (/follow.?up|redistribu/.test(n)) {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const tasks = db.tasks.filter((t) => !t.done && t.type === "follow-up" && new Date(t.dueAt) <= endOfDay);
    const stale = db.deals.filter((d) => d.status === "aberto" && Date.now() - new Date(d.updatedAt).getTime() > 48 * 3_600_000);
    const total = tasks.length + stale.length;
    const replies: Reply[] = [{
      text: `Existem ${total} oportunidades que precisam de follow-up hoje: ${tasks.length} tarefas de follow-up vencendo e ${stale.length} oportunidades paradas há mais de 48 horas.`,
      card: { type: "list", title: "Precisam de follow-up", items: stale.slice(0, 6).map((d) => ({ label: d.title, sub: `${brl(d.value)} · ${db.contacts.find((c) => c.id === d.contactId)?.name ?? ""}`, href: `/crm/contatos/${d.contactId}` })) },
    }];
    if (tasks.length) {
      const agentIds = [...sdrs.map((a) => a.id), "a_fu"];
      const approvalId = requestApproval({
        title: `Distribuir ${tasks.length} follow-ups`,
        description: "Redistribuir tarefas de follow-up entre os SDRs e o agente Follow-up.",
        details: [{ label: "Tarefas", value: String(tasks.length) }, { label: "Agentes", value: db.agents.filter((a) => agentIds.includes(a.id)).map((a) => a.name).join(", ") }],
        tool: "agents.assign_task", params: { taskIds: tasks.map((t) => t.id), agentIds }, risk: toolRisk(db, "agents.assign_task"), requestedBy: "Helena",
      });
      replies.push({ text: "Posso distribuir entre os SDRs.", card: { type: "approval", approvalId } });
    }
    return replies;
  }

  // Hot leads
  if (/quente|melhores oportunidades|leads? bons/.test(n)) {
    const hot = db.deals.filter((d) => d.status === "aberto" && d.probability >= 50).sort((a, b) => b.value - a.value);
    runTool("crm.search_contacts", { query: "quente" }, { actor: "Helena", actorType: "helena", requestedBy: user.name });
    return [{
      text: `Encontrei ${hot.length} leads quentes (probabilidade ≥ 50%), somando ${brl(hot.reduce((s, d) => s + d.value, 0))} em oportunidades.`,
      card: { type: "list", title: "Leads quentes", items: hot.slice(0, 8).map((d) => ({ label: d.title, sub: `${brl(d.value)} · ${d.probability}% · ${db.contacts.find((c) => c.id === d.contactId)?.name}`, href: `/crm/contatos/${d.contactId}` })) },
    }];
  }

  // Negative conversations
  if (/negativ|reclama|insatisfeit/.test(n)) {
    const neg = db.conversations.filter((c) => c.sentiment === "negativo");
    runTool("messages.search", { query: "" }, { actor: "Helena", actorType: "helena", requestedBy: user.name });
    return [{ text: `Encontrei ${neg.length} conversas com sentimento negativo.`, card: { type: "list", title: "Conversas negativas", items: neg.map((c) => ({ label: db.contacts.find((x) => x.id === c.contactId)?.name ?? "", sub: c.messages[c.messages.length - 1]?.text, href: `/atendimento/inbox?c=${c.id}` })) } }];
  }

  // Waiting for reply
  if (/esperando|aguardando resposta|sem resposta|precisa de resposta/.test(n)) {
    const waiting = db.conversations.filter((c) => c.unread > 0 && c.status !== "resolvida").sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt));
    return [{ text: `${waiting.length} clientes estão esperando resposta. O mais antigo está aguardando desde ${new Date(waiting[0]?.lastMessageAt ?? Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`, card: { type: "list", title: "Aguardando resposta", items: waiting.map((c) => ({ label: db.contacts.find((x) => x.id === c.contactId)?.name ?? "", sub: `${c.unread} nova(s) · ${c.channel}`, href: `/atendimento/inbox?c=${c.id}` })) } }];
  }

  // Approvals
  if (/aprova/.test(n)) {
    const pend = db.approvals.filter((a) => a.status === "pendente");
    if (!pend.length) return [{ text: "Não há aprovações pendentes." }];
    return [{ text: `Há ${pend.length} aprovações aguardando você.` }, ...pend.slice(0, 3).map((a) => ({ text: a.title, card: { type: "approval", approvalId: a.id } as HelenaCard }))];
  }

  // Operations status
  if (/operac|andamento|como esta a prospec/.test(n)) {
    const running = db.operations.filter((o) => o.status === "running");
    if (!running.length) return [{ text: "Nenhuma operação em execução no momento." }];
    return [{ text: `Há ${running.length} operações em execução.` }, ...running.map((o) => ({ text: `${o.code} · ${o.title}`, card: { type: "operation", operationId: o.id } as HelenaCard }))];
  }

  // Analytics
  if (/como esta|vendas|desempenho|resultado|relatorio|quantas|quantos|metricas|faturamento|caira?m|comercial/.test(n)) {
    runTool("analytics.query", {}, { actor: "Helena", actorType: "helena", requestedBy: user.name });
    const s = summary;
    const why = /cair|caira|queda/.test(n) ? `\n\nPrincipais causas que encontrei: ${s.staleDeals} oportunidades sem follow-up há mais de 48h e o agente Suporte pausado, o que atrasou respostas no Atendimento.` : "";
    return [{
      text: `Nos últimos 7 dias entraram ${s.leads7d} leads.\n\nPipeline aberto: ${brl(s.openPipeline)} em ${s.openDeals} oportunidades. ${s.won} vendas ganhas (${brl(s.wonValue)}).\n\n${s.bestAgent ? `O ${s.bestAgent.name} possui a maior taxa de resposta (${pct(s.bestAgent.rate)}).` : ""}\n\nPorém encontrei ${s.staleDeals} oportunidades sem follow-up há mais de 48 horas. Posso redistribuí-las.${why}`,
      card: { type: "stats", title: "Comercial", items: [
        { label: "Leads 7 dias", value: String(s.leads7d) },
        { label: "Pipeline aberto", value: brl(s.openPipeline) },
        { label: "Vendas ganhas", value: String(s.won) },
        { label: "Conversão", value: pct(s.conversion) },
        { label: "Reuniões (operações)", value: String(s.meetings) },
        { label: "Sem follow-up 48h", value: String(s.staleDeals) },
      ] },
    }];
  }

  // Greeting
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey|helena)\b/.test(n) && n.split(" ").length <= 4) {
    const items = [
      { label: `${s1(summary.followupsToday)} leads aguardando follow-up`, href: "/crm/tarefas" },
      { label: `${summary.pendingApprovals} aprovações aguardando você`, href: "/operacoes" },
      { label: `${db.conversations.filter((c) => c.unread > 0).length} clientes esperando resposta`, href: "/atendimento/inbox" },
    ];
    return [{ text: `${greeting()}, ${first}. Encontrei ${items.length} situações que merecem sua atenção.`, card: { type: "list", title: "Atenção", items } }];
  }

  return [{
    text: "Ainda não tenho uma ferramenta para executar isso, então não vou fingir que fiz. Posso ajudar com:",
    card: { type: "list", title: "Exemplos", items: [
      { label: "Ative o time comercial e comece a prospectar" },
      { label: "Mostre os leads quentes" },
      { label: "Quem precisa de follow-up hoje?" },
      { label: "Pause o SDR 02" },
      { label: "Crie um SDR para clínicas" },
      { label: "Como está o comercial?" },
      { label: "Quero vender 20 sites este mês. Monte uma estratégia" },
    ] },
  }];
}

const s1 = (n: number) => String(n);

export function createAgentFromProposal(messageId: string, card: Extract<HelenaCard, { type: "agent_proposal" }>) {
  const user = currentUser(getDB());
  const res = runTool("agents.create", { ...card.proposal, description: card.proposal.objective }, { actor: "Helena", actorType: "helena", requestedBy: user.name, approvedBy: user.name });
  if (res.ok) {
    updateHelenaCard(messageId, { ...card, createdAgentId: String(res.data?.id) });
    pushHelenaMessage(`Criei o agente ${card.proposal.name}. Ele está aguardando e já pode ser ativado em IA → Agentes ou pedindo para mim.`);
  } else {
    pushHelenaMessage(`Não consegui criar o agente porque ${res.message}.`);
  }
  helenaUi.set({ state: "ocioso" });
}
