import type {
  AbExperiment, Activity, Agent, AiUsage, Approval, Automation, CalendarEvent, Campaign, Company, Contact, Conversation, DB, Deal,
  Execution, KnowledgeDoc, Memory, Mission, MissionEvent, MissionTask, Operation, Task, Team, User,
} from "./types";
import { DEFAULT_ROLE_PERMISSIONS, TOOL_REGISTRY, withCalendarTools } from "./helena/registry";
import { ROBSON_OPENING_SCRIPT } from "./helena/calendar";
import { applyCommercialAgentPrompts, liveServiceOffers } from "./catalog";

const ORG = "org_novarota";

/** Fluxos reais: Maps → sem site → WhatsApp dos agentes. Sem Facebook Ads. */
export function liveMapsAutomations(organizationId: string): Automation[] {
  return [
    {
      id: "aut_maps_sdr",
      organizationId,
      name: "Maps sem site → SDR no WhatsApp",
      trigger: "lead_criado",
      conditions: [
        { field: "Origem", op: "=", value: "Prospecção" },
        { field: "Tag", op: "contém", value: "#sem-site" },
      ],
      actions: [
        { type: "adicionar_tag", value: "maps" },
        { type: "atribuir_sdr", value: "SDR 01 / SDR 02 (rodízio)" },
        { type: "enviar_mensagem", value: "Abordagem Robson no WhatsApp" },
      ],
      active: true,
      runs: 0,
    },
    {
      id: "aut_maps_qual",
      organizationId,
      name: "Resposta no WhatsApp → Qualificador",
      trigger: "mensagem_recebida",
      conditions: [{ field: "Canal", op: "=", value: "whatsapp" }],
      actions: [
        { type: "atribuir_agente", value: "Qualificador" },
        { type: "criar_tarefa", value: "Qualificar BANT" },
      ],
      active: true,
      runs: 0,
    },
    {
      id: "aut_maps_optout",
      organizationId,
      name: "Opt-out automático",
      trigger: "mensagem_recebida",
      conditions: [{ field: "Contém", op: "contém", value: "não tenho interesse" }],
      actions: [
        { type: "adicionar_tag", value: "opt-out" },
        { type: "mover_etapa", value: "Perdido" },
      ],
      active: true,
      runs: 0,
    },
    {
      id: "aut_maps_reuniao",
      organizationId,
      name: "Horário fechado → Agenda + Closer",
      trigger: "reuniao_agendada",
      conditions: [],
      actions: [
        { type: "atribuir_agente", value: "Closer" },
        { type: "mover_etapa", value: "Reunião agendada" },
      ],
      active: true,
      runs: 0,
    },
  ];
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function createSeed(now = new Date()): DB {
  const r = rng(42);
  const t = now.getTime();
  const ago = (min: number) => new Date(t - min * 60_000).toISOString();
  const days = (d: number) => ago(d * 24 * 60);
  const ahead = (d: number) => new Date(t + d * 86_400_000).toISOString();

  const users: User[] = [
    { id: "u1", organizationId: ORG, name: "Robson Alex", email: "robson@infotech.com.br", username: "admin", role: "owner", title: "CEO", color: "chart-1", status: "ativo", workHours: "08:00–19:00", goal: 15000, achieved: 0, lastSeen: ago(1) },
  ];

  const mkAgent = (a: Partial<Agent> & Pick<Agent, "id" | "name" | "role">): Agent => ({
    organizationId: ORG,
    description: "",
    objective: "",
    personality: "Profissional, cordial e objetiva.",
    prompt: "",
    model: "openai/gpt-4o-mini",
    temperature: 0.4,
    knowledgeIds: [],
    tools: withCalendarTools(["crm.search_contacts", "messages.search"]),
    channels: ["whatsapp"],
    schedule: "Seg–Sex, 08:00–18:00",
    budget: 150,
    spent: 0,
    status: "aguardando",
    permissions: ["crm.view", "crm.edit", "calendar.edit"],
    color: "chart-1",
    metrics: { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 },
    ...a,
  });

  const agents: Agent[] = [
    mkAgent({ id: "a_supcom", name: "Supervisor Comercial", role: "Supervisor", teamId: "t_com", objective: "Coordenar SDRs, Qualificador e Closer para gerar reuniões qualificadas.", model: "anthropic/claude-sonnet", status: "aguardando", color: "chart-1", budget: 200, personality: "Direto, estratégico e protetor do ritmo do time.", prompt: "Você coordena o Time Comercial da Info Tech. Delegue abordagens aos SDRs e use agendarReuniao quando um horário for fechado.", tools: withCalendarTools(["crm.search_contacts", "crm.assign_lead", "agents.assign_task", "analytics.query"]) }),
    mkAgent({ id: "a_sdr1", name: "SDR 01", role: "SDR", teamId: "t_com", supervisorId: "a_supcom", objective: "Prospectar e abordar leads sem site pelo WhatsApp da agência.", status: "aguardando", color: "chart-2", personality: "Consultivo, humano e persistente sem ser agressivo.", prompt: `Abordagem inicial (personalidade Robson Alex):\n${ROBSON_OPENING_SCRIPT}\nContorne objeções de preço/tempo com Groq e conduza ao agendamento de 10 minutos. Sempre chame agendarReuniao quando o cliente fechar horário.`, tools: withCalendarTools(["crm.search_contacts", "crm.create_lead", "messages.send", "crm.create_task", "sales.handle_objection"]), knowledgeIds: ["k1", "k2", "k3"] }),
    mkAgent({ id: "a_sdr2", name: "SDR 02", role: "SDR", teamId: "t_com", supervisorId: "a_supcom", objective: "Prospectar e abordar leads sem site pelo WhatsApp da agência.", status: "aguardando", color: "chart-3", personality: "Consultivo, humano e persistente sem ser agressivo.", prompt: `Abordagem inicial (personalidade Robson Alex):\n${ROBSON_OPENING_SCRIPT}\nContorne objeções de preço/tempo com Groq e conduza ao agendamento de 10 minutos. Sempre chame agendarReuniao quando o cliente fechar horário.`, tools: withCalendarTools(["crm.search_contacts", "crm.create_lead", "messages.send", "crm.create_task", "sales.handle_objection"]), knowledgeIds: ["k1", "k2", "k3"] }),
    mkAgent({ id: "a_qual", name: "Qualificador", role: "Qualificador", teamId: "t_com", supervisorId: "a_supcom", objective: "Qualificar respostas (BANT) e encaminhar interessados ao Closer.", status: "aguardando", color: "chart-4", model: "google/gemini-flash", tools: withCalendarTools(["crm.search_contacts", "sales.qualify_bant", "messages.send"]) }),
    mkAgent({ id: "a_closer", name: "Closer", role: "Closer", teamId: "t_com", supervisorId: "a_supcom", objective: "Conduzir reuniões, propostas e negociação até o fechamento.", model: "anthropic/claude-sonnet", status: "aguardando", color: "chart-5", budget: 250, knowledgeIds: ["k1", "k4", "k5"], personality: "Consultor de negócios, direto e empático. Quebra objeções de preço e prazo.", prompt: "Você é o Closer da Info Tech. Use Groq para responder dúvidas, contornar preço/tempo e gravar a reunião na Agenda com agendarReuniao(leadId, dataHora, resumo) assim que o horário for fechado no WhatsApp.", tools: withCalendarTools(["crm.move_lead", "messages.send", "sales.handle_objection", "sales.generate_checkout_pix"]) }),
    mkAgent({ id: "a_supat", name: "Supervisor Atendimento", role: "Supervisor", teamId: "t_at", objective: "Garantir SLA de resposta e qualidade do atendimento.", model: "anthropic/claude-sonnet", status: "aguardando", color: "chart-1" }),
    mkAgent({ id: "a_at", name: "Atendimento Geral", role: "Atendimento", teamId: "t_at", supervisorId: "a_supat", objective: "Responder dúvidas de clientes e leads em até 2 minutos.", status: "aguardando", color: "chart-2", channels: ["whatsapp", "instagram", "webchat"], knowledgeIds: ["k1"] }),
    mkAgent({ id: "a_sup", name: "Suporte", role: "Suporte", teamId: "t_at", supervisorId: "a_supat", objective: "Resolver chamados técnicos de clientes ativos.", status: "pausado", color: "chart-4", channels: ["email", "webchat"], knowledgeIds: ["k1"] }),
    mkAgent({ id: "a_cs", name: "Customer Success", role: "Customer Success", teamId: "t_at", supervisorId: "a_supat", objective: "Acompanhar onboarding e identificar oportunidades de upsell.", status: "aguardando", color: "chart-3" }),
    mkAgent({ id: "a_fu", name: "Follow-up", role: "Follow-up", objective: "Retomar propostas e leads parados há mais de 48 horas.", status: "aguardando", color: "chart-5", tools: withCalendarTools(["crm.search_contacts", "messages.send", "crm.create_task"]) }),
  ];
  applyCommercialAgentPrompts(agents);

  const teams: Team[] = [
    { id: "t_com", organizationId: ORG, name: "Comercial", objective: "Gerar reuniões qualificadas para venda de sites e tráfego.", supervisorId: "a_supcom", agentIds: ["a_sdr1", "a_sdr2", "a_qual", "a_closer"], goals: "Reuniões na Agenda compartilhada", schedule: "Seg–Sex, 08:00–19:00", channels: ["whatsapp", "email"], budget: 900, spent: 0, status: "ativo", metrics: { leads: 0, meetings: 0, conversions: 0 } },
    { id: "t_at", organizationId: ORG, name: "Atendimento", objective: "Responder 100% dos contatos em até 2 minutos com resolução no primeiro contato.", supervisorId: "a_supat", agentIds: ["a_at", "a_sup", "a_cs"], goals: "SLA 2 min", schedule: "Todos os dias, 07:00–22:00", channels: ["whatsapp", "instagram", "webchat", "email"], budget: 400, spent: 0, status: "ativo", metrics: { leads: 0, meetings: 0, conversions: 0 } },
  ];

  const companies: Company[] = [];

  const contacts: Contact[] = [];

  const pipelines: DB["pipelines"] = [
    { id: "pl_com", organizationId: ORG, name: "Comercial", stages: [
      { id: "st_novo", name: "Novo lead", probability: 10, color: "chart-3" },
      { id: "st_qual", name: "Qualificado", probability: 30, color: "chart-2" },
      { id: "st_reun", name: "Reunião agendada", probability: 50, color: "chart-4" },
      { id: "st_prop", name: "Proposta enviada", probability: 70, color: "chart-5" },
      { id: "st_neg", name: "Negociação", probability: 85, color: "chart-1" },
      { id: "st_ganho", name: "Ganho", probability: 100, color: "chart-2" },
    ] },
    { id: "pl_pos", organizationId: ORG, name: "Pós-venda", stages: [
      { id: "st_onb", name: "Onboarding", probability: 100, color: "chart-3" },
      { id: "st_ativo", name: "Cliente ativo", probability: 100, color: "chart-2" },
      { id: "st_renov", name: "Renovação", probability: 80, color: "chart-1" },
    ] },
  ];

  const deals: Deal[] = [];
  const activities: Activity[] = [];
  const tasks: Task[] = [];
  const conversations: Conversation[] = [];

  const opSteps = (labels: string[], doneUpTo: number, running = true) => labels.map((label, i) => ({
    id: `s${i}`, label, status: (i < doneUpTo ? "done" : i === doneUpTo && running ? "running" : "pending") as "done" | "running" | "pending",
  }));
  const PROSPECT_STEPS = ["Selecionar lista", "Preparar agentes", "Validar WhatsApp", "Prospectar empresas", "Classificar respostas", "Encaminhar interessados", "Gerar relatório"];
  const operations: Operation[] = [
    { id: "op1", organizationId: ORG, code: "OP-2938", title: "Prospecção Outubro", objective: "Prospectar 100 agências e prestadores B2B em SP e gerar reuniões.", requestedBy: "Letícia Andrade", agentIds: ["a_sdr1", "a_sdr2", "a_qual", "a_closer"], connectionId: "wa1", status: "running", total: 100, processed: 78, metrics: { responded: 21, interested: 12, qualified: 6, meetings: 3, handoffs: 1 }, cost: 18.42, steps: opSteps(PROSPECT_STEPS, 3), events: [
      { at: days(2), text: "Helena recebeu o comando de Letícia Andrade", kind: "info" },
      { at: days(2), text: "Plano aprovado por Letícia Andrade", kind: "success" },
      { at: days(2), text: "SDR 01 e SDR 02 ativados", kind: "info" },
      { at: days(1), text: "50 contatos processados", kind: "info" },
      { at: ago(180), text: "Luciana Barros (Alfa Imóveis) pediu reunião", kind: "success" },
      { at: ago(40), text: "1 lead solicitou atendimento humano", kind: "warning" },
    ], createdAt: days(2) },
    { id: "op2", organizationId: ORG, code: "OP-2931", title: "Reativação de clientes", objective: "Reativar 50 clientes sem compra há mais de 6 meses.", requestedBy: "Rafael Monteiro", agentIds: ["a_fu", "a_cs"], connectionId: "wa1", status: "running", total: 50, processed: 21, metrics: { responded: 7, interested: 3, qualified: 2, meetings: 1, handoffs: 0 }, cost: 4.1, steps: opSteps(["Selecionar clientes inativos", "Gerar mensagens personalizadas", "Enviar contatos", "Classificar respostas", "Gerar relatório"], 2), events: [
      { at: days(4), text: "Operação criada por Rafael Monteiro", kind: "info" },
      { at: days(3), text: "Follow-up iniciou os envios", kind: "info" },
    ], createdAt: days(4) },
    { id: "op3", organizationId: ORG, code: "OP-2925", title: "Follow-up propostas", objective: "Retomar todas as propostas sem resposta há mais de 48h.", requestedBy: "Helena", agentIds: ["a_fu", "a_closer"], connectionId: "wa1", status: "running", total: 34, processed: 31, metrics: { responded: 14, interested: 6, qualified: 6, meetings: 4, handoffs: 2 }, cost: 2.86, steps: opSteps(["Identificar propostas paradas", "Priorizar por valor", "Enviar follow-ups", "Encaminhar respostas ao Closer"], 2), events: [
      { at: days(6), text: "Helena identificou 34 propostas paradas", kind: "info" },
      { at: days(6), text: "Execução aprovada por Letícia Andrade", kind: "success" },
    ], createdAt: days(6) },
    { id: "op4", organizationId: ORG, code: "OP-2940", title: "Campanha Clínicas SP", objective: "Contatar 100 clínicas sem presença digital adequada.", requestedBy: "Letícia Andrade", agentIds: ["a_sdr2"], connectionId: "wa1", status: "awaiting_approval", total: 100, processed: 0, metrics: { responded: 0, interested: 0, qualified: 0, meetings: 0, handoffs: 0 }, cost: 0, steps: opSteps(PROSPECT_STEPS, 0, false), events: [
      { at: ago(25), text: "Helena montou o plano e aguarda aprovação", kind: "warning" },
    ], createdAt: ago(25) },
    { id: "op5", organizationId: ORG, code: "OP-2902", title: "Qualificação leads Facebook", objective: "Qualificar 60 leads vindos de Facebook Ads.", requestedBy: "Rafael Monteiro", agentIds: ["a_qual"], status: "completed", total: 60, processed: 60, metrics: { responded: 38, interested: 19, qualified: 11, meetings: 5, handoffs: 3 }, cost: 3.9, steps: opSteps(["Importar leads", "Classificar", "Encaminhar qualificados"], 3, false), events: [
      { at: days(12), text: "Operação concluída: 11 leads qualificados", kind: "success" },
    ], createdAt: days(14), result: "11 leads qualificados e 5 reuniões agendadas." },
    { id: "op6", organizationId: ORG, code: "OP-2915", title: "Disparo novidades Suporte", objective: "Avisar 120 clientes sobre nova central de suporte.", requestedBy: "Diego Martins", agentIds: ["a_sup"], connectionId: "wa3", status: "failed", total: 120, processed: 0, metrics: { responded: 0, interested: 0, qualified: 0, meetings: 0, handoffs: 0 }, cost: 0, steps: [
      { id: "s0", label: "Selecionar clientes", status: "done" },
      { id: "s1", label: "Validar WhatsApp", status: "failed", detail: "Conexão WhatsApp Suporte offline" },
      { id: "s2", label: "Enviar mensagens", status: "pending" },
    ], events: [
      { at: days(8), text: "Não consegui iniciar: a conexão WhatsApp Suporte está offline.", kind: "error" },
    ], createdAt: days(8), result: "Falhou: conexão WhatsApp Suporte offline." },
  ];

  const approvals: Approval[] = [
    { id: "ap1", organizationId: ORG, title: "Iniciar campanha Clínicas SP", description: "Envio de primeira abordagem para clínicas sem presença digital.", details: [
      { label: "Contatos", value: "100" }, { label: "Canal", value: "WhatsApp Comercial" }, { label: "Limite", value: "100 mensagens" }, { label: "Agente", value: "SDR 02" },
    ], tool: "campaigns.start", params: { campaignId: "cp2", operationId: "op4" }, risk: "alto", requestedBy: "Helena", status: "pendente", createdAt: ago(25) },
    { id: "ap2", organizationId: ORG, title: "Ativar automação externa n8n", description: "Enviar leads ganhos para o ERP via webhook n8n.", details: [
      { label: "Destino", value: "https://n8n.novarota.com.br/webhook/erp" }, { label: "Gatilho", value: "Oportunidade ganha" },
    ], tool: "automation.create", params: { name: "Enviar ganhos para ERP", trigger: "Etapa alterada", action: "webhook" }, risk: "alto", requestedBy: "Supervisor Comercial", status: "pendente", createdAt: ago(95) },
  ];

  const execRaw: [number, string, Execution["actorType"], string, string, Execution["result"], string?][] = [
    [2900, "Helena", "helena", "helena.command", "Recebeu comando: ativar time comercial e prospectar", "sucesso"],
    [2899, "Helena", "helena", "helena.plan", "Criou plano OP-2938 com 7 etapas", "sucesso"],
    [2897, "Letícia Andrade", "user", "approval.approve", "Aprovou execução da OP-2938", "sucesso"],
    [2896, "Helena", "helena", "agents.activate", "Ativou SDR 01", "sucesso"],
    [2896, "Helena", "helena", "agents.activate", "Ativou SDR 02", "sucesso"],
    [2895, "Helena", "helena", "operations.start", "Iniciou operação Prospecção Outubro", "sucesso"],
    [2880, "SDR 01", "agent", "messages.send", "10 mensagens enviadas (lista Empresas SP)", "sucesso"],
    [1440, "SDR 02", "agent", "crm.create_lead", "Criou lead Landing page implantes", "sucesso"],
    [600, "Qualificador", "agent", "crm.move_lead", "Moveu Portal imobiliário para Proposta enviada", "sucesso"],
    [420, "Supervisor Comercial", "agent", "crm.assign_lead", "Atribuiu 4 leads ao Closer", "sucesso"],
    [300, "Closer", "agent", "calendar.create_event", "Agendou reunião com Dra. Mariana Lopes", "sucesso"],
    [240, "Suporte", "agent", "messages.send", "Falha ao responder Aline Ribeiro", "falha", "Agente pausado"],
    [180, "Helena", "helena", "analytics.query", "Consultou métricas comerciais dos últimos 7 dias", "sucesso"],
    [95, "Supervisor Comercial", "agent", "automation.create", "Solicitou aprovação para automação n8n", "pendente"],
    [25, "Helena", "helena", "operations.start", "Montou plano Campanha Clínicas SP (aguardando aprovação)", "pendente"],
    [12, "Follow-up", "agent", "crm.create_task", "Criou 3 tarefas de follow-up", "sucesso"],
  ];
  const executions: Execution[] = execRaw.map(([m, actor, actorType, action, description, result, error], i) => ({
    id: `ex${i}`, organizationId: ORG, at: ago(m), actor, actorType, action, description, result, error,
    requestedBy: actorType === "user" ? actor : "Letícia Andrade",
    approvedBy: action === "operations.start" && result === "sucesso" ? "Letícia Andrade" : undefined,
    durationMs: Math.round(120 + r() * 2400),
  })).reverse();

  const calendarEvents: CalendarEvent[] = [
    {
      id: "ev1", organizationId: ORG, leadId: "p1", agenteId: "a_closer",
      dataHora: ahead(0.4), titulo: "Reunião 10 min · Dra. Mariana Lopes",
      resumo: "Apresentação de site odontológico. Fechado pelo Closer no WhatsApp.",
      status: "confirmada", dealId: undefined, createdAt: ago(300), updatedAt: ago(120),
    },
    {
      id: "ev2", organizationId: ORG, leadId: "p8", agenteId: "a_sdr2",
      dataHora: ahead(1.2), titulo: "Reunião 10 min · Dr. André Figueiredo",
      resumo: "Diagnóstico de presença no Google Maps.",
      status: "agendada", createdAt: ago(180), updatedAt: ago(180),
    },
    {
      id: "ev3", organizationId: ORG, leadId: "p6", agenteId: "a_sdr1",
      dataHora: ago(24 * 60), titulo: "Reunião 10 min · Eduardo Vasconcelos",
      resumo: "Proposta de site institucional B2B.",
      status: "realizada", createdAt: days(3), updatedAt: ago(24 * 60),
    },
  ];

  const mem = (id: string, type: Memory["type"], title: string, content: string, source: string, d: number): Memory => ({ id, organizationId: ORG, type, title, content, source, createdAt: days(d), updatedAt: days(d / 2) });
  const memories: Memory[] = [
    mem("mem_produtos", "permanente", "Produtos e serviços", "Tabela viva em Prospecção → Orçamentos. Os agentes só podem cotar o que está ativo nessa lista (preço editável pelo Robson).", "Robson Alex", 1),
    mem("mem_icp", "permanente", "ICP principal", "Empresas B2B no Brasil sem site (ou site fraco) e com WhatsApp ativo. Nicho definido na varredura, não só clínicas.", "Robson Alex", 1),
    mem("mem_tom", "permanente", "Tom de comunicação", "Cordial, direto e consultivo. Sem gírias. Abordagem no WhatsApp com a personalidade do Robson Alex.", "Robson Alex", 1),
    mem("mem_horario", "permanente", "Horário comercial", "Prospecção Seg–Sex, 09:00–18:00 (America/Sao_Paulo). Não disparar aos domingos.", "Robson Alex", 1),
    mem("mem_desconto", "permanente", "Política de desconto", "Desconto máximo de 10% sem aprovação do Robson. Acima disso, encaminhar para o CEO.", "Robson Alex", 1),
  ];

  const knowledge: KnowledgeDoc[] = [
    { id: "k1", organizationId: ORG, name: "Tabela-precos-2026.pdf", type: "PDF", size: 482_000, collection: "Produtos e preços", status: "indexado", chunks: 12, uploadedAt: days(30), agentIds: ["a_sdr1", "a_sdr2", "a_closer"] },
    { id: "k2", organizationId: ORG, name: "ICP-e-personas.docx", type: "DOCX", size: 120_000, collection: "ICP", status: "indexado", chunks: 9, uploadedAt: days(28), agentIds: ["a_sdr1", "a_sdr2"] },
    { id: "k3", organizationId: ORG, name: "Scripts-prospeccao.txt", type: "TXT", size: 18_000, collection: "Produtos e preços", status: "indexado", chunks: 6, uploadedAt: days(26), agentIds: ["a_sdr1", "a_sdr2"] },
    { id: "k4", organizationId: ORG, name: "Playbook-objecoes.docx", type: "DOCX", size: 210_000, collection: "Objeções", status: "indexado", chunks: 28, uploadedAt: days(25), agentIds: ["a_closer"] },
    { id: "k5", organizationId: ORG, name: "Politicas-comerciais.pdf", type: "PDF", size: 340_000, collection: "Políticas", status: "indexado", chunks: 15, uploadedAt: days(20), agentIds: ["a_closer"] },
    { id: "k6", organizationId: ORG, name: "FAQ-clientes.csv", type: "CSV", size: 56_000, collection: "Suporte", status: "indexado", chunks: 44, uploadedAt: days(15), agentIds: ["a_at", "a_sup"] },
    { id: "k7", organizationId: ORG, name: "Documentacao-servicos.pdf", type: "PDF", size: 1_240_000, collection: "Suporte", status: "indexando", chunks: 0, uploadedAt: ago(30), agentIds: ["a_at"] },
  ];

  const campaigns: Campaign[] = [
    { id: "cp1", organizationId: ORG, name: "Prospecção Outubro", listId: "l1", cadenceId: "cd1", agentIds: ["a_sdr1", "a_sdr2"], channel: "whatsapp", connectionId: "wa1", status: "ativa", total: 100, sent: 78, replies: 21, interested: 12, meetings: 3, optOuts: 2, createdAt: days(2) },
    { id: "cp2", organizationId: ORG, name: "Campanha Clínicas SP", listId: "l2", cadenceId: "cd2", agentIds: ["a_sdr2"], channel: "whatsapp", connectionId: "wa1", status: "aguardando_aprovacao", total: 100, sent: 0, replies: 0, interested: 0, meetings: 0, optOuts: 0, createdAt: ago(25) },
    { id: "cp3", organizationId: ORG, name: "Reativação base 2025", listId: "l3", cadenceId: "cd3", agentIds: ["a_fu"], channel: "whatsapp", connectionId: "wa1", status: "ativa", total: 50, sent: 21, replies: 7, interested: 3, meetings: 1, optOuts: 1, createdAt: days(4) },
    { id: "cp4", organizationId: ORG, name: "Imobiliárias Grande SP", listId: "l4", cadenceId: "cd1", agentIds: ["a_sdr1"], channel: "email", connectionId: "wa1", status: "rascunho", total: 80, sent: 0, replies: 0, interested: 0, meetings: 0, optOuts: 0, createdAt: days(1) },
    { id: "cp5", organizationId: ORG, name: "Black Friday Varejo", listId: "l3", cadenceId: "cd2", agentIds: ["a_sdr2"], channel: "whatsapp", connectionId: "wa1", status: "concluida", total: 60, sent: 60, replies: 18, interested: 7, meetings: 2, optOuts: 4, createdAt: days(20) },
  ];

  const aiUsage: AiUsage[] = [];
  const usageAgents: [string, string, AiUsage["provider"], number][] = [
    ["a_sdr1", "openai/gpt-4o-mini", "openai", 1.1], ["a_sdr2", "openai/gpt-4o-mini", "openai", 1.3],
    ["a_closer", "anthropic/claude-sonnet", "anthropic", 1.6], ["a_at", "openai/gpt-4o-mini", "openai", 0.9],
    ["helena", "anthropic/claude-opus", "anthropic", 2.2], ["a_qual", "google/gemini-flash", "google", 0.3],
  ];
  for (let d = 29; d >= 0; d--) {
    for (const [agentId, model, provider, base] of usageAgents) {
      const input = Math.round((20000 + r() * 40000) * base);
      const output = Math.round(input * (0.2 + r() * 0.2));
      const price = provider === "anthropic" ? (model.includes("opus") ? 0.000045 : 0.000012) : provider === "google" ? 0.0000015 : 0.000002;
      aiUsage.push({ id: `au${d}${agentId}`, date: days(d).slice(0, 10), provider, model, agentId, inputTokens: input, outputTokens: output, cost: Math.round((input + output * 3) * price * 100) / 100 });
    }
  }

  return {
    version: 6,
    organization: { id: ORG, name: "Info Tech Ltda", slug: "info-tech", industry: "Agência de Marketing & Tecnologia B2B", timezone: "America/Sao_Paulo", document: "12.345.678/0001-90", plan: "Scale", createdAt: days(180) },
    currentUserId: "u1",
    users,
    invites: [],
    companies, contacts, pipelines, deals: [], activities, tasks: [], calendarEvents: [], conversations: [],
    quickReplies: [
      { id: "q1", organizationId: ORG, shortcut: "/prazo", title: "Prazo de entrega", text: "Nosso prazo para site institucional é de 30 dias após aprovação do layout." },
      { id: "q2", organizationId: ORG, shortcut: "/precos", title: "Faixa de preços", text: "Sites a partir de R$ 4.900, landing pages a partir de R$ 1.900 e gestão de tráfego a partir de R$ 1.800/mês." },
      { id: "q3", organizationId: ORG, shortcut: "/reuniao", title: "Convite para reunião", text: "Que tal uma conversa de 20 minutos para eu entender o seu cenário? Tenho horários amanhã às 10h ou 15h." },
      { id: "q4", organizationId: ORG, shortcut: "/cases", title: "Enviar cases", text: "Separei alguns cases do seu segmento: novarota.com.br/cases" },
      { id: "q5", organizationId: ORG, shortcut: "/obrigado", title: "Agradecimento", text: "Obrigado pelo contato! Qualquer dúvida, é só chamar por aqui." },
    ],
    agents, teams, operations: [], approvals: [], executions: [], memories, knowledge: [],
    toolSettings: TOOL_REGISTRY.map((tdef) => ({ name: tdef.name, enabled: true, risk: tdef.defaultRisk })),
    lists: [],
    campaigns: [],
    cadences: [
      { id: "cd1", organizationId: ORG, name: "B2B padrão (5 toques)", active: true, steps: [
        { day: 0, channel: "whatsapp", action: "Primeira abordagem personalizada" }, { day: 2, channel: "whatsapp", action: "Case do segmento" },
        { day: 4, channel: "email", action: "E-mail com proposta de valor" }, { day: 7, channel: "whatsapp", action: "Convite para reunião" }, { day: 12, channel: "whatsapp", action: "Mensagem de encerramento" },
      ] },
      { id: "cd2", organizationId: ORG, name: "Clínicas (3 toques)", active: true, steps: [
        { day: 0, channel: "whatsapp", action: "Diagnóstico de presença no Google" }, { day: 3, channel: "whatsapp", action: "Exemplo de site odontológico" }, { day: 6, channel: "whatsapp", action: "Convite para reunião" },
      ] },
      { id: "cd3", organizationId: ORG, name: "Reativação", active: false, steps: [
        { day: 0, channel: "whatsapp", action: "Mensagem de reconexão" }, { day: 5, channel: "email", action: "Oferta exclusiva" },
      ] },
    ],
    automations: liveMapsAutomations(ORG),
    serviceOffers: liveServiceOffers(ORG),
    connections: [
      { id: "wa_agency", organizationId: ORG, name: "agência info tech", phone: "+55 18 98101-1186", type: "cloud_api", status: "online", queue: 0, sentToday: 0, dailyLimit: 1000, lastSyncAt: ago(1) },
    ],
    templates: [
      { id: "tp1", organizationId: ORG, name: "primeira_abordagem_b2b", category: "Marketing", language: "pt_BR", status: "aprovado", body: "Olá {{1}}! Sou da Nova Rota Digital. Notei que a {{2}} pode ganhar mais clientes pelo Google. Posso te mostrar como?" },
      { id: "tp2", organizationId: ORG, name: "confirmacao_reuniao", category: "Utilidade", language: "pt_BR", status: "aprovado", body: "Oi {{1}}, confirmando nossa reunião em {{2}} às {{3}}. Responda SIM para confirmar." },
      { id: "tp3", organizationId: ORG, name: "reativacao_cliente", category: "Marketing", language: "pt_BR", status: "pendente", body: "{{1}}, sentimos sua falta! Preparamos uma condição especial para você voltar." },
      { id: "tp4", organizationId: ORG, name: "codigo_acesso", category: "Autenticação", language: "pt_BR", status: "rejeitado", body: "Seu código é {{1}}." },
    ],
    webhooks: [
      { id: "wh1", organizationId: ORG, direction: "entrada", name: "Formulário do site", url: "https://api.helena.ai/v1/hooks/in/frm_8f2a", events: ["form.submitted"], active: true, secret: "whsec_••••a91f" },
      { id: "wh2", organizationId: ORG, direction: "entrada", name: "Leads da varredura Maps", url: "https://api.helena.ai/v1/hooks/in/maps", events: ["lead.created"], active: true, secret: "whsec_••••maps" },
      { id: "wh3", organizationId: ORG, direction: "saida", name: "n8n · ERP", url: "https://n8n.novarota.com.br/webhook/erp", events: ["deal.won", "contact.created"], active: true, secret: "whsec_••••77c1" },
      { id: "wh4", organizationId: ORG, direction: "saida", name: "Zapier · Planilha", url: "https://hooks.zapier.com/hooks/catch/123/abc", events: ["deal.stage_changed"], active: false, secret: "whsec_••••f310" },
    ],
    webhookLogs: [],
    apiTokens: [
      { id: "tk_1", organizationId: ORG, name: "n8n produção", prefix: "hel_live_8f2a", scopes: ["contacts:read", "contacts:write", "deals:write"], createdAt: days(60), lastUsedAt: ago(20) },
      { id: "tk_2", organizationId: ORG, name: "Site institucional", prefix: "hel_live_c41b", scopes: ["leads:write"], createdAt: days(90), lastUsedAt: ago(80) },
    ],
    providers: [
      { id: "openai", name: "OpenAI", connected: true, keyMasked: "sk-••••••••3kF9", models: ["openai/gpt-4o", "openai/gpt-4o-mini", "openai/o4-mini"], monthlyLimit: 300, spent: 0 },
      { id: "anthropic", name: "Anthropic", connected: true, keyMasked: "sk-ant-••••••••Qp2", models: ["anthropic/claude-opus", "anthropic/claude-sonnet", "anthropic/claude-haiku"], monthlyLimit: 400, spent: 0 },
      { id: "google", name: "Google", connected: true, keyMasked: "AIza••••••••x81", models: ["google/gemini-pro", "google/gemini-flash"], monthlyLimit: 100, spent: 0 },
      { id: "openrouter", name: "OpenRouter", connected: false, keyMasked: "", models: ["openrouter/auto"], monthlyLimit: 0, spent: 0 },
    ],
    aiUsage: [],
    helenaMessages: [],
    helenaSettings: { model: "anthropic/claude-opus", agentsDefaultModel: "openai/gpt-4o-mini", classifierModel: "google/gemini-flash", autoApproveMedium: true, tone: "Executiva, objetiva e cordial", monthlyBudget: 800, alertAt: 80, blockAtLimit: true },
    rolePermissions: DEFAULT_ROLE_PERMISSIONS,
    lgpdRequests: [],
    sessions: [
      { id: "ss1", device: "Chrome · macOS", ip: "177.92.14.20", location: "São Paulo, BR", lastActive: ago(0), current: true },
      { id: "ss2", device: "Safari · iPhone", ip: "189.40.88.12", location: "São Paulo, BR", lastActive: ago(240), current: false },
      { id: "ss3", device: "Edge · Windows", ip: "200.155.3.71", location: "Campinas, BR", lastActive: days(3), current: false },
    ],
    invoices: [
      { id: "in1", number: "HEL-2026-10", date: days(20), amount: 1490, status: "paga" },
      { id: "in2", number: "HEL-2026-09", date: days(50), amount: 1490, status: "paga" },
      { id: "in3", number: "HEL-2026-08", date: days(81), amount: 990, status: "paga" },
      { id: "in4", number: "HEL-2026-11", date: ahead(10), amount: 1490, status: "aberta" },
    ],
    retentionDays: 730,
    autonomyLevel: 3 as const,
    killSwitchActive: false,
    missions: [],
    missionTasks: [],
    missionEvents: [],
    abExperiments: [],
    organizationSettings: { retentionDays: 730, mfaEnabled: false, ipWhitelist: [] },
  };
}
