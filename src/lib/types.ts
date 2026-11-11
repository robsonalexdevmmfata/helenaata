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
  | "Evento"
  | "WhatsApp";
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

export type AccountKind = "platform" | "customer";
export type SaasPlanId = "trial" | "impulso" | "maquina" | "whitelabel";

export interface User {
  id: ID;
  organizationId: ID;
  name: string;
  email: string;
  username: string;
  password?: string;
  passwordHash?: string;
  role: Role;
  title: string;
  color: ColorToken;
  status: "ativo" | "convidado" | "inativo";
  workHours: string;
  goal: number;
  achieved: number;
  lastSeen: string;
  kind?: AccountKind;
  planId?: SaasPlanId;
  trialEndsAt?: string;
  dailyProspectUsed?: number;
  dailyProspectDate?: string;
  /** Override admin da cota diária de prospecção (leads/dia). */
  dailyProspectLimit?: number;
  /** Admin libera acesso sem data de término. */
  lifetimeAccess?: boolean;
  companyName?: string;
  phone?: string;
  createdAt?: string;
  /** Instância Evolution desta conta (criada no cadastro). */
  evolutionInstance?: string;
  /** Wizard cadastro → Linha Helena → QR → mensagem teste. */
  onboardingDone?: boolean;
  prospectSegment?: string;
  prospectCity?: string;
}

export type RpaJobKind =
  | "scan_maps"
  | "diagnose"
  | "send_wa"
  | "book_meeting"
  | "build_preview"
  | "send_proposal"
  | "charge"
  | "followup"
  | "daily_report";

export type RpaJobStatus = "queued" | "running" | "sent" | "failed" | "skipped" | "awaiting_approval";

export interface RpaJob {
  id: ID;
  organizationId: ID;
  kind: RpaJobKind;
  status: RpaJobStatus;
  contactId?: ID;
  payload: Record<string, unknown>;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  error?: string;
  durationMs?: number;
  idempotencyKey: string;
  createdAt: string;
  finishedAt?: string;
}

export interface RadarSchedule {
  id: ID;
  organizationId: ID;
  segment: string;
  city: string;
  hour: number;
  limit: number;
  active: boolean;
  lastRunAt?: string;
  /** Turno 24/7: dia (vários nichos) vs noite (food noturno). */
  shift?: "day" | "night";
  windowStart?: number;
  windowEnd?: number;
  niches?: string[];
  lastNicheIndex?: number;
}

export interface CommercialProposal {
  id: ID;
  organizationId: ID;
  contactId: ID;
  title: string;
  scope: string;
  offer: string;
  benefits: string;
  amount: number;
  status: "rascunho" | "aguardando" | "enviada" | "aceita" | "recusada";
  version: number;
  createdAt: string;
  sentAt?: string;
}

export type EvidenceKind = "observed" | "not_found" | "stated_by_client" | "hypothesis";
export type NichePlay = "pizzaria" | "clinica" | "barbearia" | "outro";
export type BuyIntent = "frio" | "interessado" | "quente";
export type LeadTemperature = "frio" | "morno" | "quente" | "negociacao";
export type OpportunityRisk = "ok" | "esfriando" | "parada";

export interface NextBestAction {
  id: string;
  label: string;
  reason: string;
  tool?: string;
  params?: Record<string, unknown>;
  needsApproval: boolean;
}

export interface MatchedOffer {
  offerId: string;
  name: string;
  why: string;
  price: number;
  fitScore: number;
}

export interface CommercialContradiction {
  code: string;
  detail: string;
}

export interface RecommendationConfidence {
  score: number;
  level: "baixa" | "media" | "alta";
  favors: string[];
  limits: string[];
  note: string;
}

export interface CommercialDecision {
  id: ID;
  organizationId: ID;
  contactId: ID;
  actionId: string;
  label: string;
  reason: string;
  status: "recomendada" | "aprovada" | "rejeitada" | "executada";
  outcome?: "aberto" | "ganho" | "perdido" | "ignorado";
  createdAt: string;
  decidedAt?: string;
}

export interface OpportunitySimRow {
  id: string;
  label: string;
  offerIds: string[];
  price: number;
  fitScore: number;
  marginNote: string;
  capacityNote: string;
  premise: string;
}

export interface IntelligenceEvidence {
  code: string;
  label: string;
  observation: string;
  kind: EvidenceKind;
  source: string;
  collectedAt: string;
  supersededAt?: string;
}

export interface RoiScenario {
  name: "conservador" | "intermediario" | "otimista";
  ticket: number;
  extraOrders: number;
  premise: string;
}

export interface CommercialDossier {
  id: ID;
  organizationId: ID;
  contactId: ID;
  companyId?: ID;
  nichePlay: NichePlay;
  collectedAt: string;
  evidence: IntelligenceEvidence[];
  reputation: { pattern: string; kind: EvidenceKind; rating?: number };
  competitors: { name: string; city: string; hasSite: boolean; note: string }[];
  offer: string;
  approach: string;
  roi: {
    offerPrice: number;
    informedTicket?: number;
    informedMonthly?: number;
    ticketSource: EvidenceKind;
    scenarios: RoiScenario[];
  };
  intent: BuyIntent;
  temperature: { label: LeadTemperature; reason: string };
  risk: { level: OpportunityRisk; reason: string };
  nextAction: NextBestAction;
  matchedOffers: MatchedOffer[];
  evidenceHistory: IntelligenceEvidence[];
  contradictions: CommercialContradiction[];
  confidence: RecommendationConfidence;
  previewId?: string;
  proposalId?: string;
}

export interface DailyReport {
  id: ID;
  organizationId: ID;
  day: string;
  body: string;
  stats: Record<string, number>;
  createdAt: string;
}

export interface QuoteRequest {
  id: ID;
  userId: ID;
  name: string;
  email: string;
  company: string;
  message: string;
  createdAt: string;
  status: "aberta" | "em_conversa" | "fechada";
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

export type CalendarEventStatus = "agendada" | "confirmada" | "realizada" | "cancelada" | "no_show";

export interface CalendarEvent {
  id: ID;
  organizationId: ID;
  leadId: ID;
  agenteId: ID;
  dataHora: string;
  titulo: string;
  resumo: string;
  status: CalendarEventStatus;
  dealId?: ID;
  conversationId?: ID;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: ID;
  from: "contact" | "human" | "agent" | "helena" | "system";
  authorName: string;
  text: string;
  at: string;
  kind?: "text" | "image" | "audio" | "document" | "event";
  externalId?: string;
  deliveryStatus?: "queued" | "sent" | "delivered" | "read" | "failed";
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
  /** JID WhatsApp na Evolution (ex: 5511...@s.whatsapp.net). */
  remoteJid?: string;
  /** Acompanhamento do funil no número comercial compartilhado. */
  flow?: ConversationFlow;
}

/** Estado da conversa iniciada pela prospecção no número compartilhado. */
export type FlowState = "novo" | "abordado" | "visualizou" | "respondeu" | "aguardando_aprovacao" | "closer" | "reuniao_agendada" | "esfriou";

export interface ConversationFlow {
  origin: "prospeccao" | "inbound";
  state: FlowState;
  campaignId?: ID;
  /** Preenchido no primeiro disparo real. */
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
  instanceName?: string;
  type: "qrcode" | "cloud_api";
  status: "online" | "offline" | "conectando";
  deletedAt?: string;
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
  /** Meta de faturamento mensal (ex.: 3000) — campanha 24/7. */
  monthlyGoal?: number;
  /** ISO: até quando o chip fica em resfriamento (Meta restringiu). */
  waCoolUntil?: string;
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

export interface SitePreviewReview {
  author: string;
  rating: number;
  text: string;
}

export interface SitePreviewItem {
  name: string;
  description: string;
  price: number;
  /** Foto do prato/serviço (Unsplash ou Maps). */
  image?: string;
}

export interface SitePreview {
  id: ID;
  organizationId: ID;
  slug: string;
  companyId: ID;
  contactId: ID;
  dealId?: ID;
  name: string;
  segment: string;
  city: string;
  address: string;
  phone: string;
  rating: number;
  reviewCount: number;
  reviews: SitePreviewReview[];
  hours: string;
  tagline: string;
  about: string;
  palette: { bg: string; fg: string; accent: string };
  photos: string[];
  /** Logo / avatar do negócio (Maps ou gerado). */
  logoUrl?: string;
  menu?: { category: string; items: SitePreviewItem[] }[];
  services?: { name: string; description: string }[];
  mapsUrl: string;
  previewPath: string;
  /** pronta = aguarda admin; aprovada = liberada p/ envio; rejeitada = refazer; enviada = WhatsApp mandou */
  status: "pronta" | "aprovada" | "rejeitada" | "enviada" | "aprovada_cliente";
  createdBy: string;
  createdAt: string;
  githubUrl?: string;
  vercelUrl?: string;
  deployError?: string;
  /** Nota do admin ao aprovar/rejeitar layout. */
  reviewNote?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export type ServiceBilling = "unico" | "mensal" | "campanha" | "a_partir";

export interface ServiceOffer {
  id: ID;
  organizationId: ID;
  category: string;
  name: string;
  description: string;
  price: number;
  priceNote: string;
  setupFee: number;
  billing: ServiceBilling;
  active: boolean;
  pitch: string;
  updatedAt: string;
  /** Custo informado pelo assinante. Sem valor, a Helena não inventa margem. */
  costAmount?: number;
  hoursEstimate?: number;
  desiredMarginPct?: number;
  monthlyCapacity?: number;
}

export interface DB {
  version: number;
  organization: Organization;
  currentUserId: ID;
  clientPreferences?: Record<string, unknown>;
  users: User[];
  invites: Invite[];
  companies: Company[];
  contacts: Contact[];
  pipelines: Pipeline[];
  deals: Deal[];
  activities: Activity[];
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  meetings: Meeting[];
  salesFlow: SalesFlowSettings;
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
  serviceOffers: ServiceOffer[];
  sitePreviews: SitePreview[];
  quoteRequests: QuoteRequest[];
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
  rpaJobs: RpaJob[];
  radarSchedules: RadarSchedule[];
  commercialProposals: CommercialProposal[];
  commercialDossiers: CommercialDossier[];
  commercialDecisions: CommercialDecision[];
  dailyReports: DailyReport[];
  retentionDays: number;
  organizationSettings?: { retentionDays: number; mfaEnabled: boolean; ipWhitelist: string[] };
}
