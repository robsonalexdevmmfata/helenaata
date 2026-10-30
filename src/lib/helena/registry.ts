import type { RiskLevel, Role } from "@/lib/types";
import { AGENT_CALENDAR_TOOLS } from "./calendar";

export { AGENT_CALENDAR_TOOLS };

export interface ToolDef {
  name: string;
  label: string;
  description: string;
  category: "CRM" | "Mensagens" | "Agentes" | "Times" | "Campanhas" | "Conhecimento" | "Analytics" | "Agenda" | "Automação" | "Operações";
  defaultRisk: RiskLevel;
  permission: string;
}

export const TOOL_REGISTRY: ToolDef[] = [
  { name: "crm.search_contacts", label: "Buscar contatos", description: "Pesquisa contatos por nome, tag, origem ou empresa.", category: "CRM", defaultRisk: "baixo", permission: "crm.view" },
  { name: "crm.create_contact", label: "Criar contato", description: "Cria um novo contato no CRM.", category: "CRM", defaultRisk: "medio", permission: "crm.edit" },
  { name: "crm.update_contact", label: "Atualizar contato", description: "Altera dados, tags ou responsável de um contato.", category: "CRM", defaultRisk: "medio", permission: "crm.edit" },
  { name: "crm.create_lead", label: "Criar lead", description: "Cria uma oportunidade no pipeline.", category: "CRM", defaultRisk: "medio", permission: "crm.edit" },
  { name: "crm.move_lead", label: "Mover lead", description: "Move uma oportunidade para outra etapa.", category: "CRM", defaultRisk: "medio", permission: "crm.edit" },
  { name: "crm.assign_lead", label: "Atribuir lead", description: "Define o responsável (humano ou agente) por oportunidades.", category: "CRM", defaultRisk: "medio", permission: "crm.edit" },
  { name: "crm.create_task", label: "Criar tarefa", description: "Cria uma tarefa vinculada a contato ou oportunidade.", category: "CRM", defaultRisk: "medio", permission: "crm.edit" },
  { name: "messages.send", label: "Enviar mensagem", description: "Envia uma mensagem por um canal conectado.", category: "Mensagens", defaultRisk: "alto", permission: "inbox.reply" },
  { name: "messages.search", label: "Buscar mensagens", description: "Pesquisa conversas e mensagens.", category: "Mensagens", defaultRisk: "baixo", permission: "inbox.view" },
  { name: "agents.create", label: "Criar agente", description: "Cria um novo agente especialista.", category: "Agentes", defaultRisk: "medio", permission: "agents.manage" },
  { name: "agents.activate", label: "Ativar agente", description: "Coloca um agente para trabalhar.", category: "Agentes", defaultRisk: "medio", permission: "agents.manage" },
  { name: "agents.pause", label: "Pausar agente", description: "Interrompe o trabalho de um agente.", category: "Agentes", defaultRisk: "medio", permission: "agents.manage" },
  { name: "agents.assign_task", label: "Delegar tarefas", description: "Distribui tarefas entre agentes.", category: "Agentes", defaultRisk: "medio", permission: "agents.manage" },
  { name: "teams.activate", label: "Ativar time", description: "Ativa todos os agentes de um time.", category: "Times", defaultRisk: "medio", permission: "teams.manage" },
  { name: "teams.create", label: "Criar time", description: "Cria um novo time de agentes.", category: "Times", defaultRisk: "medio", permission: "teams.manage" },
  { name: "teams.pause", label: "Pausar time", description: "Pausa todos os agentes de um time.", category: "Times", defaultRisk: "medio", permission: "teams.manage" },
  { name: "campaigns.create", label: "Criar campanha", description: "Cria uma campanha de prospecção em rascunho.", category: "Campanhas", defaultRisk: "medio", permission: "prospect.manage" },
  { name: "campaigns.start", label: "Iniciar campanha", description: "Inicia o envio em massa de uma campanha.", category: "Campanhas", defaultRisk: "alto", permission: "campaigns.send" },
  { name: "campaigns.pause", label: "Pausar campanha", description: "Pausa uma campanha em andamento.", category: "Campanhas", defaultRisk: "medio", permission: "prospect.manage" },
  { name: "operations.start", label: "Iniciar operação", description: "Cria e inicia uma operação com agentes e contato externo.", category: "Operações", defaultRisk: "alto", permission: "campaigns.send" },
  { name: "operations.pause", label: "Pausar operação", description: "Pausa uma operação em andamento.", category: "Operações", defaultRisk: "medio", permission: "prospect.manage" },
  { name: "operations.resume", label: "Retomar operação", description: "Retoma uma operação pausada.", category: "Operações", defaultRisk: "medio", permission: "prospect.manage" },
  { name: "knowledge.search", label: "Buscar conhecimento", description: "Busca semântica na base de conhecimento.", category: "Conhecimento", defaultRisk: "baixo", permission: "helena.use" },
  { name: "analytics.query", label: "Consultar métricas", description: "Consulta indicadores comerciais e de IA.", category: "Analytics", defaultRisk: "baixo", permission: "analytics.view" },
  { name: "calendar.create_event", label: "Agendar reunião", description: "Grava um compromisso na Agenda compartilhada (lead, agente, data/hora e status).", category: "Agenda", defaultRisk: "baixo", permission: "calendar.edit" },
  { name: "calendar.agendar_reuniao", label: "agendarReuniao", description: "Tool calling: agendarReuniao(leadId, dataHora, resumo).", category: "Agenda", defaultRisk: "baixo", permission: "calendar.edit" },
  { name: "calendar.list_events", label: "Listar agenda", description: "Consulta compromissos da Agenda compartilhada.", category: "Agenda", defaultRisk: "baixo", permission: "calendar.edit" },
  { name: "calendar.update_event", label: "Atualizar reunião", description: "Altera status ou horário de um compromisso.", category: "Agenda", defaultRisk: "baixo", permission: "calendar.edit" },
  { name: "calendar.cancel_event", label: "Cancelar reunião", description: "Cancela uma reunião da Agenda.", category: "Agenda", defaultRisk: "medio", permission: "calendar.edit" },
  { name: "sales.closer_takeover", label: "Closer assume lead sem resposta", description: "A Closer entra na conversa do número comercial quando o lead não respondeu ou visualizou e não respondeu.", category: "Mensagens", defaultRisk: "medio", permission: "inbox.reply" },
  { name: "sales.update_flow_settings", label: "Regras do número comercial", description: "Altera as regras de entrada da Closer no número compartilhado.", category: "Automação", defaultRisk: "baixo", permission: "prospect.manage" },
  { name: "messages.register_event", label: "Registrar evento do WhatsApp", description: "Registra que o cliente visualizou ou respondeu uma mensagem.", category: "Mensagens", defaultRisk: "baixo", permission: "inbox.view" },
  { name: "prospect.scan_maps", label: "Varredura Maps nacional (#sem-site)", description: "Varre o Brasil (nicho + cidade/UF ou Brasil inteiro). Importa só negócios sem site e com WhatsApp válido; Time Comercial dispara pela instância helena.", category: "Campanhas", defaultRisk: "medio", permission: "prospect.manage" },
  { name: "dev.build_presence", label: "Time Dev IA · site e cardápio", description: "Varre nicho sem site (e sem cardápio online, se for comida), o Time Desenvolvimento IA monta a prévia e o Time Comercial aborda o dono com o link.", category: "Operações", defaultRisk: "medio", permission: "prospect.manage" },
  { name: "automation.create", label: "Criar automação", description: "Cria e ativa uma automação externa.", category: "Automação", defaultRisk: "alto", permission: "automations.manage" },
  { name: "sales.handle_objection", label: "Contornar objeção comercial", description: "Aplica a matriz de objeções de vendas com resposta autônoma e ação estratégica.", category: "CRM", defaultRisk: "baixo", permission: "crm.edit" },
  { name: "sales.generate_checkout_pix", label: "Gerar Checkout Pix", description: "Gera cobrança Pix instantânea para fechamento de venda.", category: "CRM", defaultRisk: "medio", permission: "crm.edit" },
  { name: "sales.qualify_bant", label: "Qualificar Lead BANT", description: "Avalia Budget, Authority, Need e Timeline com pontuação de fechamento.", category: "CRM", defaultRisk: "baixo", permission: "crm.view" },
  { name: "sales.rescue_cold_leads", label: "Resgatar Leads Frios (>48h)", description: "Dispara mensagem com condição especial para destravar oportunidades paradas.", category: "Campanhas", defaultRisk: "medio", permission: "campaigns.send" },
  { name: "sales.adjust_cadence", label: "Ajustar Cadência Dinâmica (Meta R$ 15k)", description: "Monitora ritmo de vendas e ajusta cadência diária de prospecção.", category: "Operações", defaultRisk: "baixo", permission: "prospect.manage" },
  { name: "sales.trigger_handoff", label: "Transbordo Humano (Handoff)", description: "Transfere lead qualificado para especialista com notificação e trava de segurança.", category: "CRM", defaultRisk: "baixo", permission: "crm.edit" },
];

export const PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: "crm.view", label: "Visualizar CRM", group: "CRM" },
  { key: "crm.edit", label: "Editar CRM", group: "CRM" },
  { key: "calendar.edit", label: "Ler e escrever na Agenda compartilhada", group: "CRM" },
  { key: "crm.delete", label: "Excluir registros", group: "CRM" },
  { key: "inbox.view", label: "Ver conversas", group: "Atendimento" },
  { key: "inbox.reply", label: "Responder conversas", group: "Atendimento" },
  { key: "prospect.manage", label: "Gerenciar prospecção", group: "Prospecção" },
  { key: "campaigns.send", label: "Enviar campanhas", group: "Prospecção" },
  { key: "helena.use", label: "Usar a Helena", group: "IA" },
  { key: "agents.manage", label: "Gerenciar agentes", group: "IA" },
  { key: "teams.manage", label: "Gerenciar times de IA", group: "IA" },
  { key: "approvals.decide", label: "Aprovar ações de IA", group: "IA" },
  { key: "automations.manage", label: "Gerenciar automações", group: "Automação" },
  { key: "integrations.manage", label: "Gerenciar integrações", group: "Integrações" },
  { key: "analytics.view", label: "Ver analytics", group: "Analytics" },
  { key: "team.manage", label: "Gerenciar equipe", group: "Administração" },
  { key: "settings.manage", label: "Configurações da organização", group: "Administração" },
  { key: "billing.manage", label: "Billing", group: "Administração" },
  { key: "lgpd.manage", label: "LGPD e privacidade", group: "Administração" },
];

const ALL = PERMISSIONS.map((p) => p.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "billing.manage"),
  manager: [
    "crm.view", "crm.edit", "calendar.edit", "inbox.view", "inbox.reply", "prospect.manage", "campaigns.send",
    "helena.use", "agents.manage", "teams.manage", "approvals.decide", "analytics.view",
  ],
  agent: ["crm.view", "crm.edit", "calendar.edit", "inbox.view", "inbox.reply", "helena.use"],
  viewer: ["crm.view", "inbox.view", "analytics.view"],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
  viewer: "Viewer",
};

export function getToolDef(name: string) {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

/** Tools de Agenda que todo agente de IA precisa ter no prompt/contexto. */
export function withCalendarTools(tools: string[]) {
  const next = [...tools];
  for (const t of AGENT_CALENDAR_TOOLS) {
    if (!next.includes(t)) next.push(t);
  }
  return next;
}
