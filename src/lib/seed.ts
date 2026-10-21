import type {
  Activity, Agent, AiUsage, Approval, Campaign, Company, Contact, Conversation, DB, Deal,
  Execution, KnowledgeDoc, Memory, Operation, Task, Team, User,
} from "./types";
import { DEFAULT_ROLE_PERMISSIONS, TOOL_REGISTRY } from "./helena/registry";

const ORG = "org_novarota";

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
    { id: "u1", organizationId: ORG, name: "Letícia Andrade", email: "leticia@novarota.com.br", username: "admin", role: "owner", title: "CEO", color: "chart-1", status: "ativo", workHours: "08:00–19:00", goal: 120000, achieved: 86400, lastSeen: ago(1) },
    { id: "u2", organizationId: ORG, name: "Rafael Monteiro", email: "rafael@novarota.com.br", username: "rafael", role: "manager", title: "Head Comercial", color: "chart-2", status: "ativo", workHours: "09:00–18:00", goal: 80000, achieved: 61200, lastSeen: ago(14) },
    { id: "u3", organizationId: ORG, name: "Camila Duarte", email: "camila@novarota.com.br", username: "camila", role: "agent", title: "Executiva de vendas", color: "chart-3", status: "ativo", workHours: "09:00–18:00", goal: 40000, achieved: 32800, lastSeen: ago(42) },
    { id: "u4", organizationId: ORG, name: "Bruno Teixeira", email: "bruno@novarota.com.br", username: "bruno", role: "agent", title: "Atendimento", color: "chart-4", status: "ativo", workHours: "08:00–17:00", goal: 0, achieved: 0, lastSeen: ago(180) },
    { id: "u5", organizationId: ORG, name: "Juliana Rocha", email: "juliana@novarota.com.br", username: "juliana", role: "viewer", title: "Financeiro", color: "chart-5", status: "ativo", workHours: "09:00–18:00", goal: 0, achieved: 0, lastSeen: days(2) },
    { id: "u6", organizationId: ORG, name: "Diego Martins", email: "diego@novarota.com.br", username: "diego", role: "admin", title: "Operações", color: "chart-2", status: "ativo", workHours: "08:00–18:00", goal: 0, achieved: 0, lastSeen: ago(300) },
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
    tools: ["crm.search_contacts", "messages.search"],
    channels: ["whatsapp"],
    schedule: "Seg–Sex, 08:00–18:00",
    budget: 150,
    spent: 0,
    status: "aguardando",
    permissions: ["crm.view"],
    color: "chart-1",
    metrics: { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 },
    ...a,
  });

  const agents: Agent[] = [
    mkAgent({ id: "a_supcom", name: "Supervisor Comercial", role: "Supervisor", teamId: "t_com", objective: "Coordenar SDRs, Qualificador e Closer para gerar reuniões qualificadas.", model: "anthropic/claude-sonnet", status: "trabalhando", color: "chart-1", spent: 38.2, budget: 200, tools: ["crm.search_contacts", "crm.assign_lead", "agents.assign_task", "analytics.query"], currentTask: "Distribuindo leads da Prospecção Outubro", metrics: { tasks: 64, conversations: 0, responseRate: 0, conversions: 0 } }),
    mkAgent({ id: "a_sdr1", name: "SDR 01", role: "SDR", teamId: "t_com", supervisorId: "a_supcom", objective: "Prospectar agências e prestadores B2B em São Paulo.", status: "trabalhando", color: "chart-2", spent: 52.4, tools: ["crm.search_contacts", "crm.create_lead", "messages.send", "crm.create_task"], currentTask: "Prospecção Outubro · 41 contatos", knowledgeIds: ["k1", "k2", "k3"], metrics: { tasks: 212, conversations: 148, responseRate: 24.1, conversions: 9 } }),
    mkAgent({ id: "a_sdr2", name: "SDR 02", role: "SDR", teamId: "t_com", supervisorId: "a_supcom", objective: "Prospectar clínicas e consultórios sem presença digital.", status: "trabalhando", color: "chart-3", spent: 61.9, tools: ["crm.search_contacts", "crm.create_lead", "messages.send", "crm.create_task"], currentTask: "Prospecção Outubro · 37 contatos", knowledgeIds: ["k1", "k2", "k3"], metrics: { tasks: 198, conversations: 131, responseRate: 31.6, conversions: 12 } }),
    mkAgent({ id: "a_qual", name: "Qualificador", role: "Qualificador", teamId: "t_com", supervisorId: "a_supcom", objective: "Qualificar respostas (BANT) e encaminhar interessados ao Closer.", status: "aguardando", color: "chart-4", spent: 12.3, model: "google/gemini-flash", metrics: { tasks: 89, conversations: 54, responseRate: 0, conversions: 21 } }),
    mkAgent({ id: "a_closer", name: "Closer", role: "Closer", teamId: "t_com", supervisorId: "a_supcom", objective: "Conduzir reuniões, propostas e negociação até o fechamento.", model: "anthropic/claude-sonnet", status: "aguardando", color: "chart-5", spent: 44.0, budget: 250, knowledgeIds: ["k1", "k4", "k5"], tools: ["crm.move_lead", "calendar.create_event", "messages.send"], metrics: { tasks: 46, conversations: 38, responseRate: 0, conversions: 7 } }),
    mkAgent({ id: "a_supat", name: "Supervisor Atendimento", role: "Supervisor", teamId: "t_at", objective: "Garantir SLA de resposta e qualidade do atendimento.", model: "anthropic/claude-sonnet", status: "trabalhando", color: "chart-1", spent: 21.0, metrics: { tasks: 31, conversations: 0, responseRate: 0, conversions: 0 } }),
    mkAgent({ id: "a_at", name: "Atendimento Geral", role: "Atendimento", teamId: "t_at", supervisorId: "a_supat", objective: "Responder dúvidas de clientes e leads em até 2 minutos.", status: "trabalhando", color: "chart-2", spent: 33.7, channels: ["whatsapp", "instagram", "webchat"], knowledgeIds: ["k6", "k7"], currentTask: "4 conversas abertas", metrics: { tasks: 340, conversations: 290, responseRate: 98.2, conversions: 4 } }),
    mkAgent({ id: "a_sup", name: "Suporte", role: "Suporte", teamId: "t_at", supervisorId: "a_supat", objective: "Resolver chamados técnicos de clientes ativos.", status: "pausado", color: "chart-4", spent: 9.1, channels: ["email", "webchat"], knowledgeIds: ["k6"], metrics: { tasks: 77, conversations: 70, responseRate: 91.4, conversions: 0 } }),
    mkAgent({ id: "a_cs", name: "Customer Success", role: "Customer Success", teamId: "t_at", supervisorId: "a_supat", objective: "Acompanhar onboarding e identificar oportunidades de upsell.", status: "trabalhando", color: "chart-3", spent: 18.6, metrics: { tasks: 58, conversations: 41, responseRate: 87.0, conversions: 3 } }),
    mkAgent({ id: "a_fu", name: "Follow-up", role: "Follow-up", objective: "Retomar propostas e leads parados há mais de 48 horas.", status: "trabalhando", color: "chart-5", spent: 15.2, currentTask: "12 tarefas na fila", tools: ["crm.search_contacts", "messages.send", "crm.create_task"], metrics: { tasks: 12, conversations: 66, responseRate: 28.4, conversions: 5 } }),
  ];

  const teams: Team[] = [
    { id: "t_com", organizationId: ORG, name: "Comercial", objective: "Gerar 40 reuniões qualificadas por mês para venda de sites e tráfego.", supervisorId: "a_supcom", agentIds: ["a_sdr1", "a_sdr2", "a_qual", "a_closer"], goals: "40 reuniões · R$ 120 mil em propostas", schedule: "Seg–Sex, 08:00–19:00", channels: ["whatsapp", "email"], budget: 900, spent: 208.8, status: "ativo", metrics: { leads: 183, meetings: 27, conversions: 9 } },
    { id: "t_at", organizationId: ORG, name: "Atendimento", objective: "Responder 100% dos contatos em até 2 minutos com resolução no primeiro contato.", supervisorId: "a_supat", agentIds: ["a_at", "a_sup", "a_cs"], goals: "SLA 2 min · CSAT 4,7", schedule: "Todos os dias, 07:00–22:00", channels: ["whatsapp", "instagram", "webchat", "email"], budget: 400, spent: 82.4, status: "ativo", metrics: { leads: 64, meetings: 3, conversions: 4 } },
  ];

  const companiesRaw: [string, string, string, string, string][] = [
    ["Clínica Sorriso Pleno", "Odontologia", "São Paulo, SP", "11–50", "sorrisopleno.com.br"],
    ["Odonto Vita", "Odontologia", "Campinas, SP", "1–10", "odontovita.com.br"],
    ["Studio Bela Forma", "Estética", "São Paulo, SP", "1–10", "belaforma.com.br"],
    ["Agência Pulsar", "Marketing", "São Paulo, SP", "11–50", "pulsar.ag"],
    ["Constrular Engenharia", "Construção", "Santo André, SP", "51–200", "constrular.com.br"],
    ["Vértice Contabilidade", "Contabilidade", "São Paulo, SP", "11–50", "verticecontabil.com.br"],
    ["Padaria Trigo de Ouro", "Alimentação", "Osasco, SP", "11–50", "trigodeouro.com.br"],
    ["Instituto Movimento", "Fisioterapia", "Santos, SP", "11–50", "institutomovimento.com.br"],
    ["Grupo Alfa Imóveis", "Imobiliário", "São Paulo, SP", "51–200", "alfaimoveis.com.br"],
    ["TechNorte Sistemas", "Tecnologia", "Belo Horizonte, MG", "11–50", "technorte.com.br"],
  ];
  const companies: Company[] = companiesRaw.map(([name, segment, city, size, website], i) => ({
    id: `c${i + 1}`, organizationId: ORG, name, segment, city, size, website,
    ownerId: ["u2", "u3", "a_sdr1", "a_sdr2"][i % 4], createdAt: days(60 - i * 4),
  }));

  const sources: Contact["source"][] = ["Facebook Ads", "Google Ads", "Indicação", "Site", "Prospecção", "Instagram", "Evento"];
  const contactsRaw: [string, string, number | null, string[]][] = [
    ["Dra. Mariana Lopes", "Diretora clínica", 0, ["quente", "clínica"]],
    ["Carlos Henrique Prado", "Sócio", 1, ["clínica"]],
    ["Patrícia Nogueira", "Proprietária", 2, ["estética", "quente"]],
    ["Thiago Albuquerque", "Diretor de criação", 3, ["agência", "parceiro"]],
    ["Fernanda Siqueira", "Gerente de marketing", 4, ["B2B"]],
    ["Eduardo Vasconcelos", "Sócio-diretor", 5, ["B2B", "quente"]],
    ["Renata Campos", "Proprietária", 6, ["varejo"]],
    ["Dr. André Figueiredo", "Fisioterapeuta", 7, ["clínica", "reunião"]],
    ["Luciana Barros", "Diretora comercial", 8, ["imobiliário", "quente"]],
    ["Marcelo Tavares", "CEO", 9, ["B2B", "tecnologia"]],
    ["Aline Ribeiro", "Recepcionista", 0, ["clínica"]],
    ["Gustavo Peixoto", "Coordenador", 4, ["B2B"]],
    ["Beatriz Moura", "Autônoma", null, ["lead frio"]],
    ["Rodrigo Saldanha", "Gerente", 8, ["imobiliário"]],
    ["Sofia Cardoso", "Fundadora", null, ["e-commerce", "quente"]],
    ["Vinícius Pacheco", "Analista", 9, ["tecnologia"]],
    ["Helena Brandão", "Dentista", 1, ["clínica", "reunião"]],
    ["Otávio Lins", "Diretor financeiro", 5, ["B2B"]],
    ["Larissa Menezes", "Esteticista", 2, ["estética"]],
    ["Pedro Antunes", "Proprietário", 6, ["varejo", "opt-out"]],
  ];
  const contacts: Contact[] = contactsRaw.map(([name, title, ci, tags], i) => {
    const first = name.replace(/^(Dra?\. )/, "").split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const company = ci === null ? undefined : companies[ci];
    return {
      id: `p${i + 1}`, organizationId: ORG, name, title, tags,
      email: `${first}@${company ? company.website : "gmail.com"}`,
      phone: `+55 11 9${String(8000 + i * 137).padStart(4, "0")}-${String(1000 + i * 271).slice(0, 4)}`,
      companyId: company?.id,
      source: sources[i % sources.length],
      ownerId: ["u2", "u3", "a_sdr1", "a_sdr2", "a_closer"][i % 5],
      status: i % 6 === 5 ? "cliente" : i === 19 ? "inativo" : "lead",
      score: Math.round(30 + r() * 65),
      consent: i !== 19,
      createdAt: days(40 - i * 1.7),
      lastContactAt: ago(Math.round(30 + r() * 6000)),
    };
  });

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

  const dealsRaw: [string, number, string, number][] = [
    ["Site institucional + SEO", 0, "st_prop", 8900],
    ["Landing page implantes", 1, "st_qual", 3200],
    ["Gestão de tráfego 6 meses", 2, "st_neg", 14400],
    ["Parceria white-label", 3, "st_reun", 6000],
    ["Portal de obras", 4, "st_prop", 18500],
    ["Site + automação WhatsApp", 5, "st_neg", 9800],
    ["Cardápio digital", 6, "st_novo", 2400],
    ["Site + agenda online", 7, "st_reun", 5600],
    ["Portal imobiliário", 8, "st_prop", 22000],
    ["Redesign SaaS", 9, "st_qual", 12500],
    ["Google Meu Negócio", 10, "st_novo", 1200],
    ["Campanha LinkedIn Ads", 11, "st_qual", 4800],
    ["Loja virtual", 14, "st_reun", 11000],
    ["Integração CRM", 15, "st_novo", 3500],
    ["Site odontológico", 16, "st_prop", 7400],
    ["Consultoria BPO", 17, "st_novo", 6200],
    ["Pacote Instagram", 18, "st_ganho", 2900],
    ["Landing Black Friday", 12, "st_qual", 1900],
    ["Manutenção mensal", 13, "st_neg", 3600],
    ["Site imobiliária", 13, "st_ganho", 9500],
  ];
  const stageProb = Object.fromEntries(pipelines[0].stages.map((s) => [s.id, s.probability]));
  const deals: Deal[] = dealsRaw.map(([title, pi, stageId, value], i) => {
    const c = contacts[pi];
    const owner = ["a_sdr1", "u3", "a_closer", "u2", "a_sdr2"][i % 5];
    return {
      id: `d${i + 1}`, organizationId: ORG, pipelineId: "pl_com", stageId, title,
      contactId: c.id, companyId: c.companyId, value,
      probability: stageProb[stageId], expectedClose: ahead(5 + i * 2),
      ownerId: owner, ownerType: owner.startsWith("a_") ? "agent" : "user",
      source: c.source, status: stageId === "st_ganho" ? "ganho" : "aberto",
      tags: c.tags.slice(0, 2), createdAt: days(30 - i), updatedAt: ago(Math.round(60 + r() * 5000)),
    };
  });
  deals.push(
    { id: "d21", organizationId: ORG, pipelineId: "pl_com", stageId: "st_prop", title: "Site restaurante", contactId: "p20", companyId: "c7", value: 4200, probability: 0, expectedClose: days(3), ownerId: "u3", ownerType: "user", source: "Site", status: "perdido", lossReason: "Preço acima do orçamento", tags: [], createdAt: days(25), updatedAt: days(4) },
    { id: "d22", organizationId: ORG, pipelineId: "pl_pos", stageId: "st_onb", title: "Onboarding Pacote Instagram", contactId: "p19", companyId: "c3", value: 2900, probability: 100, expectedClose: ahead(10), ownerId: "a_cs", ownerType: "agent", source: "Instagram", status: "aberto", tags: [], createdAt: days(3), updatedAt: ago(200) },
    { id: "d23", organizationId: ORG, pipelineId: "pl_pos", stageId: "st_ativo", title: "Site imobiliária · suporte", contactId: "p14", companyId: "c9", value: 9500, probability: 100, expectedClose: ahead(60), ownerId: "a_cs", ownerType: "agent", source: "Indicação", status: "aberto", tags: [], createdAt: days(12), updatedAt: days(1) },
  );

  const activities: Activity[] = [];
  contacts.forEach((c, i) => {
    activities.push({ id: `ac${i}a`, organizationId: ORG, contactId: c.id, type: "ia", text: `Lead criado via ${c.source}`, actor: "Sistema", createdAt: c.createdAt });
    activities.push({ id: `ac${i}b`, organizationId: ORG, contactId: c.id, type: "whatsapp", text: "Primeira abordagem enviada pelo SDR", actor: i % 2 ? "SDR 02" : "SDR 01", createdAt: days(Math.max(0.2, 30 - i * 1.5)) });
    if (i % 3 === 0) activities.push({ id: `ac${i}c`, organizationId: ORG, contactId: c.id, type: "etapa", text: "Movido para Qualificado", actor: "Qualificador", createdAt: days(Math.max(0.1, 20 - i)) });
    if (i % 4 === 0) activities.push({ id: `ac${i}d`, organizationId: ORG, contactId: c.id, type: "nota", text: "Tem interesse, mas quer ver cases do mesmo segmento antes da reunião.", actor: "Camila Duarte", createdAt: days(Math.max(0.05, 10 - i / 2)) });
    if (i % 5 === 0) activities.push({ id: `ac${i}e`, organizationId: ORG, contactId: c.id, type: "handoff", text: "Handoff: Qualificador → Closer", actor: "Supervisor Comercial", createdAt: days(Math.max(0.03, 5 - i / 5)) });
  });

  const tasks: Task[] = [
    ["Retomar proposta Site institucional", "p1", "d1", "a_fu", "agent", -1, "follow-up", "alta"],
    ["Ligar para Patrícia sobre tráfego", "p3", "d3", "u3", "user", 0, "ligacao", "alta"],
    ["Enviar cases de clínicas", "p8", "d8", "a_closer", "agent", 0, "follow-up", "media"],
    ["Confirmar reunião Portal imobiliário", "p9", "d9", "u2", "user", 0, "reuniao", "alta"],
    ["Follow-up Landing implantes", "p2", "d2", "a_sdr2", "agent", -2, "follow-up", "media"],
    ["Ajustar escopo Portal de obras", "p5", "d5", "u3", "user", 1, "proposta", "media"],
    ["Retornar Eduardo após feriado", "p6", "d6", "a_fu", "agent", 2, "follow-up", "baixa"],
    ["Qualificar respostas Facebook Ads", undefined, undefined, "a_qual", "agent", 0, "outro", "media"],
    ["Proposta Loja virtual", "p15", "d13", "a_closer", "agent", 1, "proposta", "alta"],
    ["Follow-up Redesign SaaS", "p10", "d10", "a_sdr1", "agent", -3, "follow-up", "media"],
    ["Revisar contrato manutenção", "p14", "d19", "u2", "user", 3, "outro", "baixa"],
    ["Ligar Dra. Helena (site odontológico)", "p17", "d15", "u3", "user", -1, "ligacao", "alta"],
    ["Follow-up Campanha LinkedIn", "p12", "d12", "a_fu", "agent", 0, "follow-up", "media"],
    ["Enviar onboarding Pacote Instagram", "p19", "d22", "a_cs", "agent", -5, "outro", "baixa", true],
  ].map(([title, contactId, dealId, assigneeId, assigneeType, d, type, priority, done], i) => ({
    id: `tk${i + 1}`, organizationId: ORG, title: title as string,
    contactId: contactId as string | undefined, dealId: dealId as string | undefined,
    assigneeId: assigneeId as string, assigneeType: assigneeType as Task["assigneeType"],
    dueAt: new Date(t + (d as number) * 86_400_000 + 3_600_000 * (i % 5)).toISOString(),
    done: Boolean(done), type: type as Task["type"], priority: priority as Task["priority"],
  }));

  const conv = (id: string, contactId: string, channel: Conversation["channel"], handlerType: Conversation["handlerType"], handlerId: string, status: Conversation["status"], sentiment: Conversation["sentiment"], unread: number, msgs: [Conversation["messages"][number]["from"], string, string, number][]): Conversation => ({
    id, organizationId: ORG, contactId, channel, handlerType, handlerId, status, sentiment, unread,
    connectionId: channel === "whatsapp" ? "wa1" : undefined,
    messages: msgs.map(([from, authorName, text, m], i) => ({ id: `${id}m${i}`, from, authorName, text, at: ago(m), kind: from === "system" ? "event" : "text" })),
    lastMessageAt: ago(msgs[msgs.length - 1][3]),
  });
  const conversations: Conversation[] = [
    conv("cv1", "p1", "whatsapp", "agent", "a_closer", "aberta", "positivo", 2, [
      ["agent", "SDR 01", "Olá, Dra. Mariana! Vi que a Sorriso Pleno ainda não aparece bem no Google para 'implante dentário em SP'. Posso mostrar como resolvemos isso para outra clínica?", 320],
      ["contact", "Dra. Mariana Lopes", "Oi! Pode sim, temos interesse em melhorar isso.", 300],
      ["system", "Sistema", "Handoff: SDR 01 → Closer (lead qualificado)", 290],
      ["agent", "Closer", "Que ótimo! Preparei uma proposta com site + SEO local. Podemos conversar amanhã às 10h?", 280],
      ["contact", "Dra. Mariana Lopes", "Recebi a proposta. Achei interessante, mas preciso entender o prazo de entrega.", 12],
      ["contact", "Dra. Mariana Lopes", "Vocês conseguem em 30 dias?", 11],
    ]),
    conv("cv2", "p3", "instagram", "human", "u3", "aberta", "positivo", 1, [
      ["contact", "Patrícia Nogueira", "Vi o anúncio de vocês. Quanto custa gestão de tráfego?", 200],
      ["agent", "Atendimento Geral", "Oi, Patrícia! Os planos começam em R$ 1.800/mês. Posso entender melhor o seu momento?", 198],
      ["system", "Sistema", "Handoff: Atendimento Geral → Camila Duarte (solicitou humano)", 190],
      ["human", "Camila Duarte", "Patrícia, aqui é a Camila. Podemos fazer uma call rápida hoje?", 150],
      ["contact", "Patrícia Nogueira", "Pode ser às 16h?", 35],
    ]),
    conv("cv3", "p13", "whatsapp", "agent", "a_sdr2", "pendente", "negativo", 0, [
      ["agent", "SDR 02", "Olá, Beatriz! Trabalhamos com presença digital para profissionais autônomos. Faz sentido conversarmos?", 900],
      ["contact", "Beatriz Moura", "Não tenho interesse, por favor não me mande mais mensagens.", 860],
      ["system", "Sistema", "Opt-out registrado. Contato adicionado à blacklist.", 859],
    ]),
    conv("cv4", "p9", "whatsapp", "agent", "a_qual", "aberta", "positivo", 3, [
      ["agent", "SDR 01", "Luciana, notei que o portal da Alfa Imóveis não tem busca por mapa. Quer ver um exemplo?", 600],
      ["contact", "Luciana Barros", "Quero sim. Temos 400 imóveis e o site atual é lento.", 420],
      ["agent", "Qualificador", "Entendi! Qual a previsão de investimento e quem participa da decisão?", 410],
      ["contact", "Luciana Barros", "Eu e o diretor. Orçamento até 25 mil.", 20],
      ["contact", "Luciana Barros", "Podemos marcar uma reunião essa semana?", 18],
      ["contact", "Luciana Barros", "Quinta de manhã seria ideal.", 17],
    ]),
    conv("cv5", "p6", "email", "human", "u2", "aberta", "neutro", 0, [
      ["contact", "Eduardo Vasconcelos", "Rafael, conseguimos avançar com a automação de WhatsApp só no próximo mês.", 1500],
      ["human", "Rafael Monteiro", "Sem problemas, Eduardo. Deixo agendado um contato para o dia 5.", 1440],
    ]),
    conv("cv6", "p20", "whatsapp", "agent", "a_at", "resolvida", "negativo", 0, [
      ["contact", "Pedro Antunes", "Achei o preço muito alto, vou fechar com outra empresa.", 4000],
      ["agent", "Atendimento Geral", "Entendo, Pedro. Obrigado pelo retorno! Se mudar de ideia, estamos por aqui.", 3990],
    ]),
    conv("cv7", "p15", "webchat", "helena", "helena", "aberta", "positivo", 1, [
      ["contact", "Sofia Cardoso", "Oi, quero montar uma loja virtual para minha marca de cosméticos.", 90],
      ["helena", "Helena", "Olá, Sofia! Vou te conectar com nosso Closer, que é especialista em e-commerce. Pode me dizer quantos produtos você tem hoje?", 88],
      ["contact", "Sofia Cardoso", "Uns 60 produtos.", 6],
    ]),
    conv("cv8", "p17", "whatsapp", "agent", "a_sdr2", "aberta", "neutro", 1, [
      ["agent", "SDR 02", "Dra. Helena, montamos sites para dentistas com agendamento online. Posso te mostrar?", 2000],
      ["contact", "Helena Brandão", "Pode mandar alguns exemplos?", 55],
    ]),
    conv("cv9", "p11", "messenger", "agent", "a_at", "pendente", "negativo", 1, [
      ["contact", "Aline Ribeiro", "Mandei mensagem ontem e ninguém respondeu.", 240],
    ]),
  ];

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
    ], tool: "operations.resume", params: { operationId: "op4" }, risk: "alto", requestedBy: "Helena", status: "pendente", createdAt: ago(25) },
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

  const mem = (id: string, type: Memory["type"], title: string, content: string, source: string, d: number): Memory => ({ id, organizationId: ORG, type, title, content, source, createdAt: days(d), updatedAt: days(d / 2) });
  const memories: Memory[] = [
    mem("m1", "permanente", "Produtos e serviços", "Sites institucionais (a partir de R$ 4.900), landing pages (R$ 1.900), gestão de tráfego (R$ 1.800/mês), automação de WhatsApp (R$ 3.500).", "Letícia Andrade", 90),
    mem("m2", "permanente", "ICP principal", "Clínicas, consultórios e prestadores B2B de 5 a 200 funcionários em SP, sem site responsivo ou com baixa presença no Google.", "Letícia Andrade", 90),
    mem("m3", "permanente", "Tom de comunicação", "Cordial, direto e consultivo. Sem gírias. Tratar profissionais de saúde por Dr./Dra.", "Rafael Monteiro", 80),
    mem("m4", "permanente", "Horário comercial", "Contatos de prospecção somente Seg–Sex, 09:00–18:00. Nunca enviar mensagens aos domingos.", "Letícia Andrade", 70),
    mem("m5", "permanente", "Política de desconto", "Desconto máximo de 10% sem aprovação humana. Acima disso, encaminhar para Rafael.", "Rafael Monteiro", 60),
    mem("m6", "operacional", "Meta de outubro", "40 reuniões qualificadas e R$ 120 mil em propostas.", "Helena", 20),
    mem("m7", "operacional", "SDR 02 performa melhor em clínicas", "Taxa de resposta 31,6% em clínicas vs. 19% em B2B geral. Priorizar SDR 02 para saúde.", "Helena", 7),
    mem("m8", "operacional", "Decisão: pausar Suporte fora do horário", "Diego decidiu pausar o agente Suporte enquanto a base de FAQ é revisada.", "Diego Martins", 5),
    mem("m9", "conversa", "Preferência da Letícia", "Prefere relatórios curtos com números absolutos e variação percentual.", "Helena", 10),
    mem("m10", "conversa", "Objeção recorrente", "Clínicas perguntam sobre prazo de entrega. Resposta padrão: 30 dias para site institucional.", "Closer", 4),
    mem("m11", "documental", "Tabela de preços 2026", "Indexado a partir de Tabela-precos-2026.pdf (12 trechos).", "Base de conhecimento", 30),
    mem("m12", "documental", "Playbook de objeções", "Indexado a partir de Playbook-objecoes.docx (28 trechos).", "Base de conhecimento", 25),
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
    version: 1,
    organization: { id: ORG, name: "Nova Rota Digital", slug: "nova-rota", industry: "Agência de marketing e sites", timezone: "America/Sao_Paulo", document: "12.345.678/0001-90", plan: "Scale", createdAt: days(180) },
    currentUserId: "u1",
    users,
    invites: [
      { id: "iv1", organizationId: ORG, email: "marina@novarota.com.br", role: "agent", sentAt: days(1) },
      { id: "iv2", organizationId: ORG, email: "paulo@novarota.com.br", role: "manager", sentAt: days(3) },
    ],
    companies, contacts, pipelines, deals, activities, tasks, conversations,
    quickReplies: [
      { id: "q1", organizationId: ORG, shortcut: "/prazo", title: "Prazo de entrega", text: "Nosso prazo para site institucional é de 30 dias após aprovação do layout." },
      { id: "q2", organizationId: ORG, shortcut: "/precos", title: "Faixa de preços", text: "Sites a partir de R$ 4.900, landing pages a partir de R$ 1.900 e gestão de tráfego a partir de R$ 1.800/mês." },
      { id: "q3", organizationId: ORG, shortcut: "/reuniao", title: "Convite para reunião", text: "Que tal uma conversa de 20 minutos para eu entender o seu cenário? Tenho horários amanhã às 10h ou 15h." },
      { id: "q4", organizationId: ORG, shortcut: "/cases", title: "Enviar cases", text: "Separei alguns cases do seu segmento: novarota.com.br/cases" },
      { id: "q5", organizationId: ORG, shortcut: "/obrigado", title: "Agradecimento", text: "Obrigado pelo contato! Qualquer dúvida, é só chamar por aqui." },
    ],
    agents, teams, operations, approvals, executions, memories, knowledge,
    toolSettings: TOOL_REGISTRY.map((tdef) => ({ name: tdef.name, enabled: true, risk: tdef.defaultRisk })),
    lists: [
      { id: "l1", organizationId: ORG, name: "Empresas SP", segment: "Agências e prestadores B2B", icp: "5–200 funcionários, sem site responsivo", count: 412, source: "Importação CSV", blacklisted: 6, createdAt: days(40) },
      { id: "l2", organizationId: ORG, name: "Clínicas SP", segment: "Clínicas e consultórios", icp: "Clínicas sem Google Meu Negócio otimizado", count: 238, source: "Pesquisa Helena", blacklisted: 3, createdAt: days(10) },
      { id: "l3", organizationId: ORG, name: "Clientes inativos", segment: "Base própria", icp: "Sem compra há 6+ meses", count: 87, source: "CRM", blacklisted: 1, createdAt: days(5) },
      { id: "l4", organizationId: ORG, name: "Imobiliárias Grande SP", segment: "Imobiliário", icp: "Mais de 100 imóveis anunciados", count: 156, source: "Importação CSV", blacklisted: 0, createdAt: days(1) },
    ],
    campaigns,
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
    automations: [
      { id: "au1", organizationId: ORG, name: "Leads do Facebook para SDR", trigger: "Lead criado", conditions: [{ field: "Origem", op: "=", value: "Facebook Ads" }], actions: [{ type: "Adicionar tag", value: "facebook" }, { type: "Atribuir agente", value: "SDR 01" }, { type: "Enviar mensagem", value: "Boas-vindas" }, { type: "Criar tarefa", value: "Qualificar em 24h" }], active: true, runs: 214, lastRunAt: ago(35) },
      { id: "au2", organizationId: ORG, name: "Proposta sem resposta", trigger: "Tempo sem resposta", conditions: [{ field: "Etapa", op: "=", value: "Proposta enviada" }, { field: "Horas sem resposta", op: ">", value: "48" }], actions: [{ type: "Atribuir agente", value: "Follow-up" }], active: true, runs: 58, lastRunAt: ago(300) },
      { id: "au3", organizationId: ORG, name: "Opt-out automático", trigger: "Mensagem recebida", conditions: [{ field: "Sentimento", op: "=", value: "Negativo" }, { field: "Contém", op: "contém", value: "não tenho interesse" }], actions: [{ type: "Adicionar tag", value: "opt-out" }, { type: "Mover etapa", value: "Perdido" }], active: true, runs: 19, lastRunAt: days(1) },
      { id: "au4", organizationId: ORG, name: "Ganho → onboarding", trigger: "Etapa alterada", conditions: [{ field: "Etapa", op: "=", value: "Ganho" }], actions: [{ type: "Mover pipeline", value: "Pós-venda" }, { type: "Atribuir agente", value: "Customer Success" }, { type: "Webhook", value: "ERP" }], active: false, runs: 0 },
    ],
    connections: [
      { id: "wa1", organizationId: ORG, name: "WhatsApp Comercial", phone: "+55 11 94000-1200", type: "cloud_api", status: "online", queue: 14, sentToday: 86, dailyLimit: 1000, lastSyncAt: ago(1) },
      { id: "wa2", organizationId: ORG, name: "WhatsApp Atendimento", phone: "+55 11 94000-3400", type: "qrcode", status: "online", queue: 2, sentToday: 141, dailyLimit: 500, lastSyncAt: ago(2) },
      { id: "wa3", organizationId: ORG, name: "WhatsApp Suporte", phone: "+55 11 94000-5600", type: "qrcode", status: "offline", queue: 0, sentToday: 0, dailyLimit: 300, lastSyncAt: days(8) },
    ],
    templates: [
      { id: "tp1", organizationId: ORG, name: "primeira_abordagem_b2b", category: "Marketing", language: "pt_BR", status: "aprovado", body: "Olá {{1}}! Sou da Nova Rota Digital. Notei que a {{2}} pode ganhar mais clientes pelo Google. Posso te mostrar como?" },
      { id: "tp2", organizationId: ORG, name: "confirmacao_reuniao", category: "Utilidade", language: "pt_BR", status: "aprovado", body: "Oi {{1}}, confirmando nossa reunião em {{2}} às {{3}}. Responda SIM para confirmar." },
      { id: "tp3", organizationId: ORG, name: "reativacao_cliente", category: "Marketing", language: "pt_BR", status: "pendente", body: "{{1}}, sentimos sua falta! Preparamos uma condição especial para você voltar." },
      { id: "tp4", organizationId: ORG, name: "codigo_acesso", category: "Autenticação", language: "pt_BR", status: "rejeitado", body: "Seu código é {{1}}." },
    ],
    webhooks: [
      { id: "wh1", organizationId: ORG, direction: "entrada", name: "Formulário do site", url: "https://api.helena.ai/v1/hooks/in/frm_8f2a", events: ["form.submitted"], active: true, secret: "whsec_••••a91f" },
      { id: "wh2", organizationId: ORG, direction: "entrada", name: "Facebook Lead Ads", url: "https://api.helena.ai/v1/hooks/in/fb_3c7d", events: ["lead.created"], active: true, secret: "whsec_••••0b2e" },
      { id: "wh3", organizationId: ORG, direction: "saida", name: "n8n · ERP", url: "https://n8n.novarota.com.br/webhook/erp", events: ["deal.won", "contact.created"], active: true, secret: "whsec_••••77c1" },
      { id: "wh4", organizationId: ORG, direction: "saida", name: "Zapier · Planilha", url: "https://hooks.zapier.com/hooks/catch/123/abc", events: ["deal.stage_changed"], active: false, secret: "whsec_••••f310" },
    ],
    webhookLogs: [
      { id: "wl1", webhookId: "wh2", event: "lead.created", status: 200, attempts: 1, at: ago(35) },
      { id: "wl2", webhookId: "wh1", event: "form.submitted", status: 200, attempts: 1, at: ago(80) },
      { id: "wl3", webhookId: "wh3", event: "deal.won", status: 500, attempts: 3, at: ago(140) },
      { id: "wl4", webhookId: "wh3", event: "contact.created", status: 200, attempts: 1, at: ago(400) },
      { id: "wl5", webhookId: "wh2", event: "lead.created", status: 200, attempts: 1, at: ago(600) },
      { id: "wl6", webhookId: "wh3", event: "deal.won", status: 200, attempts: 2, at: days(1) },
    ],
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
    aiUsage,
    helenaMessages: [],
    helenaSettings: { model: "anthropic/claude-opus", agentsDefaultModel: "openai/gpt-4o-mini", classifierModel: "google/gemini-flash", autoApproveMedium: true, tone: "Executiva, objetiva e cordial", monthlyBudget: 800, alertAt: 80, blockAtLimit: true },
    rolePermissions: DEFAULT_ROLE_PERMISSIONS,
    lgpdRequests: [
      { id: "lg1", organizationId: ORG, contactName: "Pedro Antunes", type: "exclusao", status: "aberta", requestedAt: days(2) },
      { id: "lg2", organizationId: ORG, contactName: "Beatriz Moura", type: "anonimizacao", status: "aberta", requestedAt: days(1) },
      { id: "lg3", organizationId: ORG, contactName: "Renata Campos", type: "exportacao", status: "concluida", requestedAt: days(15) },
    ],
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
  };
}
