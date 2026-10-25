// Domain types. Mirrors database/schema.sql so the mock layer can be swapped
// for a real PostgreSQL-backed API later. Every business record carries organizationId.

export type ID = string;
export type Role = "owner" | "admin" | "manager" | "agent" | "viewer";
export type ColorToken = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";
export type Channel = "whatsapp" | "instagram" | "messenger" | "email" | "webchat";
export type LeadSource =
  | "Facebook Ads"
  | "Google Ads"
  | "Indicação"
  | "Site"
  | "Prospecção"
  | "Instagram"
  | "Evento";
export type RiskLevel = "baixo" | "medio" | "alto";
export type OwnerType = "user" | "agent";

export interface Organization {
  id: ID;
  name: string;
  slug: string;
  industry: string;
  timezone: string;
  document: string;
  plan: string;
  createdAt: string;
}

export interface User {
  id: ID;
  organizationId: ID;
  name: string;
  email: string;
  username: string;
  role: Role;
  title: string;
  color: ColorToken;
  status: "ativo" | "convidado" | "inativo";
  workHours: string;
  goal: number;
  achieved: number;
  lastSeen: string;
}

export interface Invite {
  id: ID;
  organizationId: ID;
  email: string;
  role: Role;
  sentAt: string;
}

export interface Company {
  id: ID;
  organizationId: ID;
  name: string;
  segment: string;
  city: string;
  size: string;
  website: string;
  ownerId: ID;
  createdAt: string;
}

export interface Contact {
  id: ID;
  organizationId: ID;
  name: string;
  email: string;
  phone: string;
  companyId?: ID;
  title: string;
  tags: string[];
  source: LeadSource;
  ownerId: ID;
  status: "lead" | "cliente" | "inativo";
  score: number;
  consent: boolean;
  createdAt: string;
  lastContactAt: string;
}

export interface Stage {
  id: ID;
  name: string;
  probability: number;
  color: ColorToken;
}

export interface Pipeline {
  id: ID;
  organizationId: ID;
  name: string;
  stages: Stage[];
}

export interface Deal {
  id: ID;
  organizationId: ID;
  pipelineId: ID;
  stageId: ID;
  title: string;
  contactId: ID;
  companyId?: ID;
  value: number;
  probability: number;
  expectedClose: string;
  ownerId: ID;
  ownerType: OwnerType;
  source: LeadSource;
  status: "aberto" | "ganho" | "perdido";
  lossReason?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | "nota"
  | "ligacao"
  | "email"
  | "whatsapp"
  | "reuniao"
  | "etapa"
  | "tarefa"
  | "handoff"
  | "ia";

export interface Activity {
  id: ID;
  organizationId: ID;
  contactId: ID;
  dealId?: ID;
  type: ActivityType;
  text: string;
  actor: string;
  createdAt: string;
}

export interface Task {
  id: ID;
  organizationId: ID;
  title: string;
  contactId?: ID;
  dealId?: ID;
  assigneeId: ID;
  assigneeType: OwnerType;
  dueAt: string;
  done: boolean;
  priority: "baixa" | "media" | "alta";
  type: "follow-up" | "ligacao" | "reuniao" | "proposta" | "outro";
}

export interface Message {
  id: ID;
  from: "contact" | "human" | "agent" | "helena" | "system";
  authorName: string;
  text: string;
  at: string;
  kind?: "text" | "image" | "audio" | "document" | "event";
}

export interface Conversation {
  id: ID;
  organizationId: ID;
  contactId: ID;
  channel: Channel;
  connectionId?: ID;
  status: "aberta" | "pendente" | "resolvida";
  handlerType: "human" | "agent" | "helena";
  handlerId: ID;
  unread: number;
  sentiment: "positivo" | "neutro" | "negativo";
  lastMessageAt: string;
  messages: Message[];
  /** Acompanhamento do funil no número comercial compartilhado. */
  flow?: ConversationFlow;
}

/** Estado da conversa iniciada pela prospecção no número compartilhado. */
export type FlowState = "abordado" | "visualizou" | "respondeu" | "closer" | "reuniao_agendada" | "esfriou";

export interface ConversationFlow {
  origin: "prospeccao" | "inbound";
  state: FlowState;
  campaignId?: ID;
  lastOutboundAt: string;
  readAt?: string;
  repliedAt?: string;
  closerAttempts: number;
  closerSince?: string;
  /** Horários oferecidos pela Closer na última mensagem (ISO). */
  proposedSlots?: string[];
}

/** Regras do número único usado por todo o time comercial. */
export interface SalesFlowSettings {
  enabled: boolean;
  sharedConnectionId: ID;
  teamUserIds: ID[];
  onlyAfterProspecting: boolean;
  noReplyHours: number;
  readNoReplyHours: number;
  maxCloserAttempts: number;
  closerAgentId: ID;
  respectBusinessHours: boolean;
  businessStart: number;
  businessEnd: number;
  meetingDurationMin: number;
  autoBookMeetings: boolean;
}

export type MeetingStatus = "agendada" | "confirmada" | "realizada" | "cancelada" | "nao_compareceu";
export type MeetingLocation = "google_meet" | "whatsapp" | "telefone" | "presencial";

export interface Meeting {
  id: ID;
  organizationId: ID;
  title: string;
  contactId?: ID;
  dealId?: ID;
  ownerId: ID;
  ownerType: OwnerType;
  startAt: string;
  durationMin: number;
  location: MeetingLocation;
  link?: string;
  status: MeetingStatus;
  source: "closer" | "helena" | "manual" | "sdr";
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface QuickReply {
  id: ID;
  organizationId: ID;
  shortcut: string;
  title: string;
  text: string;
}

export type AgentStatus = "trabalhando" | "aguardando" | "pausado" | "erro";
export type AgentHealth = "healthy" | "idle" | "busy" | "degraded" | "blocked" | "offline";

export interface Agent {
  id: ID;
  organizationId: ID;
  name: string;
  role: string;
  description: string;
  objective: string;
  personality: string;
  prompt: string;
  model: string;
  temperature: number;
  knowledgeIds: ID[];
  tools: string[];
  channels: Channel[];
  schedule: string;
  supervisorId?: ID;
  teamId?: ID;
  budget: number;
  spent: number;
  status: AgentStatus;
  health?: AgentHealth;
  isTemporary?: boolean;
  temporaryExpiresAt?: string;
  permissions: string[];
  color: ColorToken;
  currentTask?: string;
  metrics: { tasks: number; conversations: number; responseRate: number; conversions: number };
}

export type TeamStatus = "ativo" | "pausado" | "aguardando" | "erro" | "requer_aprovacao";

export interface Team {
  id: ID;
  organizationId: ID;
  name: string;
  objective: string;
  supervisorId: ID;
  agentIds: ID[];
  goals: string;
  schedule: string;
  channels: Channel[];
  budget: number;
  spent: number;
  status: TeamStatus;
  metrics: { leads: number; meetings: number; conversions: number };
}

export type OperationStatus = "running" | "awaiting_approval" | "completed" | "failed" | "paused";

export interface OperationStep {
  id: ID;
  label: string;
  status: "done" | "running" | "pending" | "failed";
  detail?: string;
}

export interface OperationEvent {
  at: string;
  text: string;
  kind: "info" | "success" | "warning" | "error";
}

export interface Operation {
  id: ID;
  organizationId: ID;
  code: string;
  title: string;
  objective: string;
  requestedBy: string;
  agentIds: ID[];
  connectionId?: ID;
  status: OperationStatus;
  total: number;
  processed: number;
  metrics: { responded: number; interested: number; qualified: number; meetings: number; handoffs: number };
  cost: number;
  steps: OperationStep[];
  events: OperationEvent[];
  createdAt: string;
  result?: string;
}

export type MissionStatus =
  | "draft"
  | "awaiting_approval"
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export interface MissionFunnel {
  prospects: number;
  contacted: number;
  replied: number;
  qualified: number;
  meetings: number;
  won: number;
}

export interface Mission {
  id: ID;
  organizationId: ID;
  code: string;
  title: string;
  objective: string;
  status: MissionStatus;
  priority: "baixa" | "media" | "alta" | "urgente";
  targetMetric: string;
  targetValue: number;
  currentValue: number;
  deadline: string;
  budget: number;
  spent: number;
  strategy: string;
  supervisorId: ID;
  agentIds: ID[];
  funnel: MissionFunnel;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type MissionTaskStatus = "pending" | "ready" | "running" | "completed" | "failed" | "skipped";

export interface MissionTask {
  id: ID;
  missionId: ID;
  title: string;
  description: string;
  agentId: ID;
  status: MissionTaskStatus;
  dependsOn: ID[];
  input?: Record<string, any>;
  output?: Record<string, any>;
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface MissionEvent {
  id: ID;
  missionId: ID;
  at: string;
  actor: string;
  kind: "info" | "success" | "warning" | "error" | "decision";
  text: string;
}

export interface AbExperiment {
  id: ID;
  organizationId: ID;
  title: string;
  status: "running" | "completed" | "paused";
  variantA: { label: string; text: string; sent: number; replies: number; conversions: number };
  variantB: { label: string; text: string; sent: number; replies: number; conversions: number };
  winner?: "A" | "B";
  recommendation?: string;
  createdAt: string;
}

export type AutonomyLevel = 1 | 2 | 3 | 4;

export interface Approval {
  id: ID;
  organizationId: ID;
  title: string;
  description: string;
  details: { label: string; value: string }[];
  tool: string;
  params: Record<string, unknown>;
  risk: RiskLevel;
  requestedBy: string;
  status: "pendente" | "aprovada" | "negada";
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
}

export interface Execution {
  id: ID;
  organizationId: ID;
  at: string;
  actor: string;
  actorType: "helena" | "agent" | "user" | "sistema";
  action: string;
  description: string;
  params?: Record<string, unknown>;
  result: "sucesso" | "falha" | "pendente";
  error?: string;
  requestedBy: string;
  approvedBy?: string;
  durationMs: number;
}

export type MemoryType = "permanente" | "conversa" | "operacional" | "documental";

export interface Memory {
  id: ID;
  organizationId: ID;
  type: MemoryType;
  title: string;
  content: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDoc {
  id: ID;
  organizationId: ID;
  name: string;
  type: "PDF" | "DOCX" | "TXT" | "CSV" | "URL";
  size: number;
  collection: string;
  status: "indexado" | "indexando" | "erro";
  chunks: number;
  uploadedAt: string;
  agentIds: ID[];
}

export interface ToolSetting {
  name: string;
  enabled: boolean;
  risk: RiskLevel;
}

export interface ProspectList {
  id: ID;
  organizationId: ID;
  name: string;
  segment: string;
  icp: string;
  count: number;
  source: string;
  blacklisted: number;
  createdAt: string;
}

export interface Campaign {
  id: ID;
  organizationId: ID;
  name: string;
  listId: ID;
  cadenceId: ID;
  agentIds: ID[];
  channel: Channel;
  connectionId: ID;
  status: "rascunho" | "ativa" | "pausada" | "concluida" | "aguardando_aprovacao";
  total: number;
  sent: number;
  replies: number;
  interested: number;
  meetings: number;
  optOuts: number;
  createdAt: string;
}

export interface CadenceStep {
  day: number;
  channel: Channel;
  action: string;
}

export interface Cadence {
  id: ID;
  organizationId: ID;
  name: string;
  steps: CadenceStep[];
  active: boolean;
}

export interface Automation {
  id: ID;
  organizationId: ID;
  name: string;
  trigger: string;
  conditions: { field: string; op: string; value: string }[];
  actions: { type: string; value: string }[];
  active: boolean;
  runs: number;
  lastRunAt?: string;
}

export interface WhatsAppConnection {
  id: ID;
  organizationId: ID;
  name: string;
  phone: string;
  type: "qrcode" | "cloud_api";
  status: "online" | "offline" | "conectando";
  queue: number;
  sentToday: number;
  dailyLimit: number;
  lastSyncAt: string;
}

export interface WaTemplate {
  id: ID;
  organizationId: ID;
  name: string;
  category: "Marketing" | "Utilidade" | "Autenticação";
  language: string;
  status: "aprovado" | "pendente" | "rejeitado";
  body: string;
}

export interface Webhook {
  id: ID;
  organizationId: ID;
  direction: "entrada" | "saida";
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
}

export interface WebhookLog {
  id: ID;
  webhookId: ID;
  event: string;
  status: number;
  attempts: number;
  at: string;
}

export interface ApiToken {
  id: ID;
  organizationId: ID;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export interface Provider {
  id: "openai" | "anthropic" | "google" | "openrouter";
  name: string;
  connected: boolean;
  keyMasked: string;
  models: string[];
  monthlyLimit: number;
  spent: number;
}

export interface AiUsage {
  id: ID;
  date: string;
  provider: Provider["id"];
  model: string;
  agentId: ID;
  operationId?: ID;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export type HelenaCard =
  | { type: "plan"; title: string; steps: { label: string; done: boolean }[]; approvalId: ID }
  | { type: "approval"; approvalId: ID }
  | { type: "operation"; operationId: ID }
  | {
      type: "mission_plan";
      missionId: ID;
      code: string;
      title: string;
      strategy: string;
      targets: { label: string; value: string }[];
      tasks: { id: string; label: string; agent: string; status: string }[];
      approvalId?: ID;
    }
  | { type: "war_room"; missionId: ID }
  | {
      type: "decision";
      decisionId: string;
      title: string;
      reason: string;
      recommendation: string;
      options: { label: string; action: string }[];
    }
  | {
      type: "briefing";
      title: string;
      summary: string;
      stats: { label: string; value: string }[];
      pendingDecisions: number;
    }
  | {
      type: "agent_proposal";
      proposal: Pick<Agent, "name" | "role" | "objective" | "tools" | "channels" | "model"> & {
        supervisorId?: ID;
        teamId?: ID;
      };
      createdAgentId?: ID;
    }
  | { type: "list"; title: string; items: { label: string; sub?: string; href?: string }[] }
  | { type: "stats"; title: string; items: { label: string; value: string; hint?: string }[] }
  | { type: "result"; ok: boolean; title: string; detail: string };

export interface HelenaMessage {
  id: ID;
  role: "user" | "helena";
  text: string;
  at: string;
  card?: HelenaCard;
}

export interface HelenaSettings {
  model: string;
  agentsDefaultModel: string;
  classifierModel: string;
  autoApproveMedium: boolean;
  tone: string;
  monthlyBudget: number;
  alertAt: number;
  blockAtLimit: boolean;
}

export interface LgpdRequest {
  id: ID;
  organizationId: ID;
  contactName: string;
  contactEmail?: string;
  type: "exportacao" | "anonimizacao" | "exclusao";
  status: "aberta" | "concluida";
  requestedAt: string;
  completedAt?: string;
}

export interface SessionInfo {
  id: ID;
  device: string;
  ip: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export interface Invoice {
  id: ID;
  number: string;
  date: string;
  amount: number;
  status: "paga" | "aberta" | "vencida" | "cancelada";
}

export interface DB {
  version: number;
  organization: Organization;
  currentUserId: ID;
  users: User[];
  invites: Invite[];
  companies: Company[];
  contacts: Contact[];
  pipelines: Pipeline[];
  deals: Deal[];
  activities: Activity[];
  tasks: Task[];
  conversations: Conversation[];
  quickReplies: QuickReply[];
  agents: Agent[];
  teams: Team[];
  operations: Operation[];
  missions: Mission[];
  missionTasks: MissionTask[];
  missionEvents: MissionEvent[];
  abExperiments: AbExperiment[];
  autonomyLevel: AutonomyLevel;
  killSwitchActive: boolean;
  approvals: Approval[];
  executions: Execution[];
  memories: Memory[];
  knowledge: KnowledgeDoc[];
  toolSettings: ToolSetting[];
  lists: ProspectList[];
  campaigns: Campaign[];
  cadences: Cadence[];
  automations: Automation[];
  connections: WhatsAppConnection[];
  templates: WaTemplate[];
  webhooks: Webhook[];
  webhookLogs: WebhookLog[];
  apiTokens: ApiToken[];
  providers: Provider[];
  aiUsage: AiUsage[];
  helenaMessages: HelenaMessage[];
  helenaSettings: HelenaSettings;
  rolePermissions: Record<Role, string[]>;
  lgpdRequests: LgpdRequest[];
  sessions: SessionInfo[];
  invoices: Invoice[];
  retentionDays: number;
  organizationSettings?: { retentionDays: number; mfaEnabled: boolean; ipWhitelist: string[] };
}
