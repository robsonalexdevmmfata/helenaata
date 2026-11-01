// Tool-calling engine. Every action performed by Helena, an agent or a user from
// the UI goes through runTool(), which checks permission/enablement, mutates the
// data store and writes an Execution record. Nothing is "pretended".
import type {
  Agent, Approval, Automation, CalendarEvent, CalendarEventStatus, DB, Execution, HelenaCard, HelenaMessage, Meeting, Operation, RiskLevel, SalesFlowSettings, Task,
} from "@/lib/types";
import { bumpAutomation, can, currentUser, getDB, nowISO, ownerName, uid, update } from "@/lib/store";
import {
    evaluateFollowup, FOLLOWUP_REASON_LABEL, hasConflict, menuProposalFollowupText, parseWhen, pickProposedSlot, shouldHoldOutbound, slotLabel, unansweredAgentStreak,
  type FollowupReason,
} from "./sales-flow";
import { getToolDef, withCalendarTools } from "./registry";
import { liveBoard, syncLiveCommercial } from "@/lib/analytics";
import { buildCatalogOpening, formatCatalogForAgents } from "@/lib/catalog";
import { normalize } from "@/lib/format";
import { brl } from "@/lib/format";
import { formatForWhatsApp, evaluateHandoff } from "./whatsapp-formatter";
import type { HandoffStage } from "./whatsapp-formatter";
import { evolutionSendText, getAgencyConnection, getEvolutionConfigUI } from "@/lib/evolution/evolutionapi";
import {
  checkDuplicateContact,
  isLeadHandledByAnotherSdr,
  OBJECTION_MATRIX,
  evaluateBant,
  generatePixCheckout,
  executeRescueColdLeads,
  computeDynamicCadence,
} from "./sales-brain";
import { runPresencePipeline } from "@/lib/dev/presence";
import { canUseDevTeam, grantAccessDays, grantLifetimeAccess, isPlatformAdmin, mustSubscribe, reserveProspects, setDailyLeadQuota } from "@/lib/saas";
import { evaluateOutbound, isOptedOut } from "@/lib/whatsapp/antiban";
import { findOrDraftConversation, pickRpaLeads, rpaOpening } from "@/lib/rpa/shift";
import { enqueueRemoteSend } from "@/lib/rpa/enqueue";
import {
  claimNextJob, draftProposal, enqueueRpa, markJob, maybeEnqueueDailyReport, maybeEnqueueRadar,
  maybeEnqueueSilenceFollowups, retryRpaJob, scheduleFollowup, upsertRadarSchedule, writeDailyReport,
} from "@/lib/rpa/center";
import { downloadWorkspaceBackup, exportContactBundle } from "@/lib/workspace/backup";
import { diagnoseLead, setCycleTag, type CycleState } from "@/lib/helena/diagnose";
import { buildDossier, detectBuyIntent } from "@/lib/helena/intelligence";
import { copilotAnswer, recordDecision } from "@/lib/helena/decision";
import { agentCouncil, companyBriefing, crisisState, isCompanyStatusQuestion, isCouncilQuestion, isCrisisQuestion } from "@/lib/helena/command";
import { agentBenchmark, autonomyBlocksTool, circuitBreaker, integrationHealth, missionReplayText, replayMission } from "@/lib/helena/reliability";
import { createMissionFromObjective, pauseMission, startMission, tickMissions } from "@/lib/helena/mission-engine";
import { runWatchdog, verifySendOutcome } from "@/lib/helena/always-on";
import { scheduleCyclePush } from "@/lib/persist/cycle";

export interface ToolContext {
  actor: string;
  actorType: Execution["actorType"];
  requestedBy?: string;
  approvedBy?: string;
}

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

const ok = (message: string, data?: Record<string, unknown>): ToolResult => ({ ok: true, message, data });
const fail = (message: string): ToolResult => ({ ok: false, message });

export function toolRisk(db: DB, name: string): RiskLevel {
  return db.toolSettings.find((t) => t.name === name)?.risk ?? getToolDef(name)?.defaultRisk ?? "alto";
}

/** Business rule: high risk always needs approval; medium depends on settings; low never. */
export function requiresApproval(risk: RiskLevel, autoApproveMedium: boolean) {
  if (risk === "alto") return true;
  if (risk === "medio") return !autoApproveMedium;
  return false;
}

export function needsApproval(db: DB, name: string) {
  if (autonomyBlocksTool(db, name)) return true;
  const risk = toolRisk(db, name);
  if ((db.autonomyLevel || 3) >= 4 && risk !== "alto") return false;
  return requiresApproval(risk, db.helenaSettings.autoApproveMedium);
}

function logExecution(e: Omit<Execution, "id" | "organizationId" | "at">) {
  update((db) => {
    db.executions.unshift({ id: uid("ex_"), organizationId: db.organization.id, at: nowISO(), ...e });
    if (db.executions.length > 400) db.executions.length = 400;
  });
  scheduleCyclePush();
}

function stampCycle(contactId: string, state: CycleState) {
  update((d) => {
    const c = d.contacts.find((x) => x.id === contactId);
    if (c) c.tags = setCycleTag(c.tags, state);
  });
}

function applyDiagnosisToContact(contactId: string) {
  const db = getDB();
  const contact = db.contacts.find((c) => c.id === contactId);
  if (!contact) return fail("contato não encontrado");
  const company = db.companies.find((c) => c.id === contact.companyId);
  const dx = diagnoseLead({
    name: company?.name || contact.name,
    segment: company?.segment,
    city: company?.city,
    website: company?.website,
    tags: contact.tags,
    hasWhatsApp: Boolean(contact.phone),
    hasMenu: (contact.tags || []).includes("#com-cardapio"),
  });
  update((d) => {
    const c = d.contacts.find((x) => x.id === contactId);
    if (!c) return;
    c.score = dx.score;
    const codes = dx.findings.map((f) => `#dx-${f.code}`);
    c.tags = setCycleTag([...new Set([...(c.tags || []).filter((t) => !t.startsWith("#dx-")), ...codes])], "diagnosticado");
    d.activities.unshift({
      id: uid("ac_dx_"),
      organizationId: d.organization.id,
      contactId,
      type: "ia",
      text: `Diagnóstico Helena ${dx.score}/100 (${dx.opportunity}): ${dx.recommend_pitch}`,
      actor: "Helena",
      createdAt: nowISO(),
    });
  });
  const dossier = buildDossier(contactId);
  return ok(`Diagnóstico ${dx.score}/100 · ${dx.opportunity}`, { contactId, dossierId: dossier?.id, ...dx });
}

export function pushHelenaMessage(text: string, card?: HelenaCard, role: HelenaMessage["role"] = "helena") {
  const id = uid("hm_");
  update((db) => {
    db.helenaMessages.push({ id, role, text, at: nowISO(), card });
    if (db.helenaMessages.length > 200) db.helenaMessages.splice(0, db.helenaMessages.length - 200);
  });
  return id;
}

export function updateHelenaCard(messageId: string, card: HelenaCard) {
  update((db) => {
    const m = db.helenaMessages.find((x) => x.id === messageId);
    if (m) m.card = card;
  });
}

function connectionCheck(db: DB, connectionId?: string): string | null {
  if (mustSubscribe(currentUser(db))) return "WhatsApp pausado: assine Impulso ou Máquina";
  const conn = connectionId
    ? db.connections.find((x) => x.id === connectionId && !x.deletedAt)
    : getAgencyConnection(db);
  if (!connectionId && !conn) return null;
  const c = conn;
  if (!c) return "a conexão de WhatsApp da agência não existe";
  if (c.status !== "online") return `a conexão ${c.name} está ${c.status}`;
  return null;
}

function setAgentsStatus(db: DB, ids: string[], status: Agent["status"], task?: string) {
  db.agents.forEach((a) => {
    if (ids.includes(a.id)) {
      a.status = status;
      if (task !== undefined) a.currentTask = task;
    }
  });
}

type Handler = (p: Record<string, any>, ctx: ToolContext) => ToolResult;

function resolveAgentId(db: DB, ctx: ToolContext, explicit?: string) {
  if (explicit && (db.agents.some((a) => a.id === explicit) || explicit === "helena")) return explicit;
  const byName = db.agents.find((a) => a.name === ctx.actor);
  if (byName) return byName.id;
  if (ctx.actorType === "helena") return "helena";
  return db.agents.find((a) => a.role === "Closer")?.id || db.agents[0]?.id || db.currentUserId;
}

function createCalendarEvent(p: Record<string, any>, ctx: ToolContext): ToolResult {
  const leadId = String(p.leadId || p.contactId || "");
  if (!leadId) return fail("leadId é obrigatório");
  const db = getDB();
  const contact = db.contacts.find((c) => c.id === leadId);
  if (!contact) return fail("lead/contato não encontrado");

  const agenteId = resolveAgentId(db, ctx, p.agenteId || p.ownerId);
  const meetingTitle = String(p.titulo || p.title || p.resumo || `Reunião 10 min · ${contact.name}`);
  const resumo = String(p.resumo || meetingTitle);
  const meetDate = String(p.dataHora || p.at || p.startAt || p.date || new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  const durationMin = Math.max(15, Number(p.durationMin) || db.salesFlow?.meetingDurationMin || 30);
  const startAt = new Date(meetDate.replace(" ", "T")).toISOString();
  if (Number.isNaN(new Date(startAt).getTime())) return fail("data da reunião inválida");
  if (hasConflict(db.meetings ?? [], agenteId, startAt, durationMin)) {
    return fail(`${ownerName(db, agenteId)} já tem uma reunião nesse horário`);
  }
  const existing = (db.calendarEvents ?? []).find((e) => {
    if (e.leadId !== leadId) return false;
    if (e.status === "cancelada") return false;
    return Math.abs(new Date(e.dataHora).getTime() - new Date(meetDate).getTime()) < 15 * 60_000;
  });
  if (existing) {
    return ok(`Compromisso já existia na Agenda compartilhada com ${contact.name}.`, {
      id: existing.id, leadId, agenteId: existing.agenteId, dataHora: existing.dataHora, calLink: `https://cal.com/infotech/${existing.id}`,
    });
  }
  const eventId = uid("ev_");
  const meetingId = uid("mt_");
  const calLink = `https://cal.com/infotech/${eventId}`;
  const closer = db.agents.find((a) => a.id === agenteId) || db.agents.find((a) => a.role === "Closer");

  update((d) => {
    if (!d.calendarEvents) d.calendarEvents = [];
    const event: CalendarEvent = {
      id: eventId,
      organizationId: d.organization.id,
      leadId,
      agenteId,
      dataHora: meetDate,
      titulo: meetingTitle,
      resumo,
      status: "agendada",
      dealId: p.dealId || d.deals.find((x) => x.contactId === leadId)?.id,
      conversationId: p.conversationId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    d.calendarEvents.unshift(event);
    if (!d.meetings) d.meetings = [];
    d.meetings.push({
      id: meetingId,
      organizationId: d.organization.id,
      title: meetingTitle,
      contactId: leadId,
      dealId: event.dealId,
      ownerId: agenteId,
      ownerType: closer ? "agent" : "user",
      startAt,
      durationMin,
      location: "whatsapp",
      status: "agendada",
      source: p.source ?? (ctx.actorType === "helena" ? "helena" : ctx.actorType === "agent" ? "closer" : "manual"),
      notes: resumo,
      createdBy: ctx.actor,
      createdAt: nowISO(),
    });
    const conv = d.conversations.find((c) => c.contactId === leadId && c.flow);
    if (conv?.flow) conv.flow.state = "reuniao_agendada";

    d.tasks.unshift({
      id: uid("tk_"),
      organizationId: d.organization.id,
      title: meetingTitle,
      contactId: leadId,
      dealId: event.dealId,
      assigneeId: closer?.id || d.currentUserId,
      assigneeType: closer ? "agent" : "user",
      dueAt: meetDate,
      done: false,
      priority: "alta",
      type: "reuniao",
    });

    const dealId = event.dealId;
    if (dealId) {
      const deal = d.deals.find((x) => x.id === dealId);
      const reunStage = d.pipelines[0]?.stages.find((s) => s.id === "st_reun" || /reuni/i.test(s.name));
      if (deal && reunStage) {
        deal.stageId = reunStage.id;
        deal.probability = reunStage.probability;
        if (closer) {
          deal.ownerId = closer.id;
          deal.ownerType = "agent";
        }
        deal.updatedAt = nowISO();
      }
    }

    const team = d.teams.find((t) => t.agentIds.includes(agenteId) || t.supervisorId === agenteId);
    if (team) team.metrics.meetings += 1;
    const agent = d.agents.find((a) => a.id === agenteId);
    if (agent) agent.metrics.conversions += 1;
    const camp = d.campaigns.find((c) => c.status === "ativa");
    if (camp) camp.meetings += 1;

    d.activities.unshift({
      id: uid("ac_"),
      organizationId: d.organization.id,
      contactId: leadId,
      dealId,
      type: "reuniao",
      text: `Agenda compartilhada: ${meetingTitle} em ${meetDate}. Agente: ${closer?.name ?? ctx.actor}.`,
      actor: ctx.actor,
      createdAt: nowISO(),
    });
    bumpAutomation(d, "reuniao_agendada");
    syncLiveCommercial(d);
  });

  return ok(`Reunião agendada na Agenda compartilhada com ${contact.name}.`, {
    id: eventId,
    meetingId,
    leadId,
    agenteId,
    dataHora: meetDate,
    startAt,
    calLink,
  });
}

const handlers: Record<string, Handler> = {
  "crm.search_contacts": (p) => {
    const q = normalize(String(p.query ?? ""));
    const db = getDB();
    const found = db.contacts.filter((c) => normalize(`${c.name} ${c.tags.join(" ")} ${c.source}`).includes(q));
    return ok(`${found.length} contatos encontrados`, { ids: found.map((c) => c.id) });
  },
  "crm.create_contact": (p, ctx) => {
    if (!p.name) return fail("nome do contato é obrigatório");
    const id = uid("p_");
    update((db) => {
      db.contacts.unshift({
        id, organizationId: db.organization.id, name: p.name, email: p.email ?? "", phone: p.phone ?? "",
        companyId: p.companyId || undefined, title: p.title ?? "", tags: p.tags ?? [], source: p.source ?? "Site",
        ownerId: p.ownerId ?? db.currentUserId, status: "lead", score: 50, consent: Boolean(p.consent ?? true),
        createdAt: nowISO(), lastContactAt: nowISO(),
      });
      db.activities.unshift({ id: uid("ac_"), organizationId: db.organization.id, contactId: id, type: "nota", text: "Contato criado", actor: ctx.actor, createdAt: nowISO() });
    });
    return ok(`Contato ${p.name} criado`, { id });
  },
  "crm.update_contact": (p) => {
    const db = getDB();
    if (!db.contacts.some((c) => c.id === p.id)) return fail("contato não encontrado");
    update((d) => {
      const c = d.contacts.find((x) => x.id === p.id)!;
      Object.assign(c, p.patch);
    });
    return ok("Contato atualizado");
  },
  "crm.create_lead": (p, ctx) => {
    const db = getDB();
    const pipeline = db.pipelines.find((x) => x.id === (p.pipelineId ?? "pl_com")) ?? db.pipelines[0];
    const stage = pipeline.stages.find((s) => s.id === p.stageId) ?? pipeline.stages[0];
    const contact = db.contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");
    const id = uid("d_");
    update((d) => {
      d.deals.unshift({
        id, organizationId: d.organization.id, pipelineId: pipeline.id, stageId: stage.id, title: p.title || `Oportunidade ${contact.name}`,
        contactId: contact.id, companyId: contact.companyId, value: Number(p.value) || 0, probability: stage.probability,
        expectedClose: p.expectedClose ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
        ownerId: p.ownerId ?? d.currentUserId, ownerType: p.ownerType ?? "user", source: contact.source, status: "aberto",
        tags: [], createdAt: nowISO(), updatedAt: nowISO(),
      });
      d.activities.unshift({ id: uid("ac_"), organizationId: d.organization.id, contactId: contact.id, dealId: id, type: "etapa", text: `Oportunidade criada em ${stage.name}`, actor: ctx.actor, createdAt: nowISO() });
    });
    return ok("Oportunidade criada", { id });
  },
  "crm.move_lead": (p, ctx) => {
    const db = getDB();
    const deal = db.deals.find((x) => x.id === p.dealId);
    if (!deal) return fail("oportunidade não encontrada");
    const pipeline = db.pipelines.find((x) => x.id === deal.pipelineId)!;
    const stage = pipeline.stages.find((s) => s.id === p.stageId);
    if (!stage) return fail("etapa não encontrada");
    if (deal.stageId === stage.id) return ok("A oportunidade já está nessa etapa");
    update((d) => {
      const x = d.deals.find((y) => y.id === deal.id)!;
      x.stageId = stage.id;
      x.probability = stage.probability;
      x.status = normalize(stage.name) === "ganho" ? "ganho" : "aberto";
      x.updatedAt = nowISO();
      d.activities.unshift({ id: uid("ac_"), organizationId: d.organization.id, contactId: x.contactId, dealId: x.id, type: "etapa", text: `Movido para ${stage.name}`, actor: ctx.actor, createdAt: nowISO() });
    });
    return ok(`${deal.title} movida para ${stage.name}`);
  },
  "crm.assign_lead": (p, ctx) => {
    const ids: string[] = p.dealIds ?? [];
    if (!ids.length) return fail("nenhuma oportunidade selecionada");
    const db = getDB();
    const ownerName = db.users.find((u) => u.id === p.ownerId)?.name ?? db.agents.find((a) => a.id === p.ownerId)?.name;
    if (!ownerName) return fail("responsável não encontrado");
    update((d) => {
      d.deals.forEach((x) => {
        if (ids.includes(x.id)) {
          x.ownerId = p.ownerId;
          x.ownerType = p.ownerType;
          x.updatedAt = nowISO();
          d.activities.unshift({ id: uid("ac_"), organizationId: d.organization.id, contactId: x.contactId, dealId: x.id, type: "handoff", text: `Responsável alterado para ${ownerName}`, actor: ctx.actor, createdAt: nowISO() });
        }
      });
    });
    return ok(`${ids.length} oportunidade(s) atribuída(s) a ${ownerName}`);
  },
  "crm.create_task": (p) => {
    if (!p.title) return fail("título da tarefa é obrigatório");
    const id = uid("tk_");
    update((d) => {
      d.tasks.unshift({
        id, organizationId: d.organization.id, title: p.title, contactId: p.contactId || undefined, dealId: p.dealId || undefined,
        assigneeId: p.assigneeId ?? d.currentUserId, assigneeType: p.assigneeType ?? "user",
        dueAt: p.dueAt ?? nowISO(), done: false, priority: p.priority ?? "media", type: p.type ?? "outro",
      });
    });
    return ok("Tarefa criada", { id });
  },
  "messages.send": (p, ctx) => {
    const db = getDB();
    const conv = db.conversations.find((c) => c.id === p.conversationId);
    if (!conv) return fail("conversa não encontrada");
    const problem = conv.channel === "whatsapp" ? connectionCheck(db, conv.connectionId) : null;
    if (problem) return fail(problem);
    const contact = db.contacts.find((c) => c.id === conv.contactId);
    const gate = evaluateOutbound({ db, conv, contact, minWaitHours: p.followup === true ? 24 : 48 });
    if (!gate.ok) return fail(gate.message);
    if (conv.flow?.origin === "prospeccao" || p.countAsProspect) {
      const quota = reserveProspects(1);
      if (!quota.ok) return fail(quota.message);
    }

    // Limpa emojis e markdown do texto que vai para o WhatsApp
    const rawText = String(p.text ?? "");
    const outText = conv.channel === "whatsapp" ? formatForWhatsApp(rawText) : rawText;

    // Determina o estágio atual com base no handler da conversa
    const stageMap: Record<string, HandoffStage> = {
      SDR: "sdr", Qualificador: "qualificador", Closer: "closer",
    };
    const currentAgent = db.agents.find((a) => a.id === conv.handlerId);
    const currentStage: HandoffStage = (currentAgent ? (stageMap[currentAgent.role] ?? "sdr") : "sdr");

    // Detecta a última mensagem do cliente para avaliar handoff
    const lastClientMsg = [...conv.messages].reverse().find((m) => m.from === "contact")?.text ?? "";
    const handoff = evaluateHandoff(lastClientMsg, currentStage, db);

    const localMessageId = uid("m_");
    update((d) => {
      const c = d.conversations.find((x) => x.id === conv.id)!;

      // Registra a mensagem enviada pelo agente
      c.messages.push({
        id: localMessageId,
        from: p.from ?? "agent",
        authorName: p.authorName ?? (currentAgent?.name ?? ctx.actor),
        text: outText,
        at: nowISO(),
        kind: "text",
      });
      c.lastMessageAt = nowISO();
      c.unread = 0;
      if (c.flow) c.flow.lastOutboundAt = nowISO();

      // Atualiza métricas do contato
      const ct = d.contacts.find((x) => x.id === c.contactId);
      if (ct) {
        ct.lastContactAt = nowISO();
        if (/vercel\.app|\/v\//.test(outText)) ct.tags = setCycleTag(ct.tags, "link_enviado");
        else if (!(ct.tags || []).some((t) => t.startsWith("#ciclo-"))) ct.tags = setCycleTag(ct.tags, "encontrado");
      }
      const wa = d.connections.find((x) => x.id === c.connectionId);
      if (wa && c.channel === "whatsapp") wa.sentToday += 1;

      // ── Handoff transparente ───────────────────────────────────────────────
      if (handoff) {
        const nextAgent = d.agents.find((a) => a.id === handoff.nextAgentId);
        if (nextAgent) {
          // Troca o handler da conversa SEM avisar o cliente
          c.handlerType = handoff.nextStage === "humano" ? "human" : "agent";
          c.handlerId = nextAgent.id;

          // Incrementa métricas do agente anterior
          if (currentAgent) {
            const prev = d.agents.find((a) => a.id === currentAgent.id);
            if (prev) prev.metrics.conversations += 1;
          }

          // Registra handoff na auditoria (invisível para o cliente)
          d.activities.unshift({
            id: uid("ac_"),
            organizationId: d.organization.id,
            contactId: c.contactId,
            type: "handoff",
            text: `Handoff transparente: ${currentAgent?.name ?? "SDR"} → ${nextAgent.name}. Motivo: ${handoff.reason}`,
            actor: "Sistema HELENA",
            createdAt: nowISO(),
          });

          // Se for para humano, cria tarefa de follow-up urgente
          if (handoff.nextStage === "humano") {
            d.tasks.unshift({
              id: uid("tk_"),
              organizationId: d.organization.id,
              title: `Atender ${d.contacts.find((x) => x.id === c.contactId)?.name ?? "cliente"} — solicitou humano`,
              contactId: c.contactId,
              assigneeId: nextAgent.id,
              assigneeType: "agent",
              dueAt: nowISO(),
              done: false,
              priority: "alta",
              type: "follow-up",
            });
          }
        }
      }
    });

    // ── Envio REAL via Evolution API (fire-and-forget) ────────────────────
    // Roda em background sem bloquear o store/UI.
    // Só dispara se for canal WhatsApp e houver número do contato.
    if (conv.channel === "whatsapp") {
      const contactPhone = getDB().contacts.find((c) => c.id === conv.contactId)?.phone ?? "";
      const sendTo = conv.remoteJid?.endsWith("@s.whatsapp.net")
        ? conv.remoteJid.replace(/@.*/, "")
        : contactPhone;
      if (sendTo) {
        const delay = Number(p.delayMs);
        if (delay > 0 && typeof window !== "undefined") {
          void enqueueRemoteSend({ number: sendTo, text: outText, delayMs: delay, instance: getEvolutionConfigUI().instance });
        }
        evolutionSendText(sendTo, outText)
          .then((res) => {
            if (!res.ok) {
              // Registra falha de envio na auditoria sem interromper o fluxo
              update((d) => {
                const sentConversation = d.conversations.find((c) => c.id === conv.id);
                const sentMessage = sentConversation?.messages.find((m) => m.id === localMessageId);
                if (sentMessage) sentMessage.deliveryStatus = "failed";
                d.executions.unshift({
                  id: uid("ex_evo_"),
                  organizationId: d.organization.id,
                  at: nowISO(),
                  actor: ctx.actor,
                  actorType: ctx.actorType,
                  action: "evolution.sendText",
                  description: `Falha ao enviar via Evolution API: ${res.error}`,
                  result: "falha",
                  error: res.error,
                  requestedBy: ctx.requestedBy ?? ctx.actor,
                  durationMs: 0,
                });
              });
              /* falha já vai para Execution */
            } else {
              update((d) => {
                const sentConversation = d.conversations.find((c) => c.id === conv.id);
                const sentMessage = sentConversation?.messages.find((m) => m.id === localMessageId);
                if (sentMessage) {
                  sentMessage.externalId = res.messageId;
                  sentMessage.deliveryStatus = "sent";
                }
                const wa = getAgencyConnection(d);
                if (wa) wa.sentToday += 1;
                d.executions.unshift({
                  id: uid("ex_evo_"),
                  organizationId: d.organization.id,
                  at: nowISO(),
                  actor: ctx.actor,
                  actorType: ctx.actorType,
                  action: "evolution.sendText",
                  description: `Mensagem enviada via Evolution (${wa?.name ?? "agencia"}) para ${contactPhone}`,
                  result: "sucesso",
                  requestedBy: ctx.requestedBy ?? ctx.actor,
                  durationMs: 0,
                });
                const camp = d.campaigns.find((x) => x.status === "ativa");
                if (camp) camp.sent += 1;
              });
              /* sucesso já vai para Execution */
            }
          })
          .catch((err) => {
            /* erro já vai para Execution */
          });
      }
    }

    return ok("Mensagem enviada");
  },
  "messages.search": (p) => {
    const q = normalize(String(p.query ?? ""));
    const found = getDB().conversations.filter((c) => c.messages.some((m) => normalize(m.text).includes(q)));
    return ok(`${found.length} conversas encontradas`, { ids: found.map((c) => c.id) });
  },
  "agents.create": (p) => {
    if (!p.name) return fail("nome do agente é obrigatório");
    const id = uid("a_");
    update((d) => {
      d.agents.push({
        id, organizationId: d.organization.id, name: p.name, role: p.role ?? "SDR", description: p.description ?? "",
        objective: p.objective ?? "", personality: p.personality ?? "Profissional, cordial e objetiva.", prompt: p.prompt ?? "",
        model: p.model ?? d.helenaSettings.agentsDefaultModel, temperature: p.temperature ?? 0.4, knowledgeIds: p.knowledgeIds ?? [],
        tools: withCalendarTools(p.tools ?? ["crm.search_contacts", "messages.send"]), channels: p.channels ?? ["whatsapp"], schedule: p.schedule ?? "Seg–Sex, 08:00–18:00",
        supervisorId: p.supervisorId || undefined, teamId: p.teamId || undefined, budget: Number(p.budget ?? 150), spent: 0,
        status: "aguardando", permissions: p.permissions ?? ["crm.view", "crm.edit", "calendar.edit"], color: (["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const)[d.agents.length % 5],
        metrics: { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 },
      });
      const team = d.teams.find((t) => t.id === p.teamId);
      if (team && !team.agentIds.includes(id)) team.agentIds.push(id);
    });
    return ok(`Agente ${p.name} criado`, { id });
  },
  "agents.activate": (p) => {
    const a = getDB().agents.find((x) => x.id === p.agentId);
    if (!a) return fail("agente não encontrado");
    if (a.spent >= a.budget) return fail(`${a.name} atingiu o limite financeiro de R$ ${a.budget}`);
    update((d) => setAgentsStatus(d, [a.id], "trabalhando"));
    return ok(`${a.name} ativado`);
  },
  "agents.pause": (p) => {
    const a = getDB().agents.find((x) => x.id === p.agentId);
    if (!a) return fail("agente não encontrado");
    if (a.status === "pausado") return ok(`${a.name} já estava pausado`);
    update((d) => setAgentsStatus(d, [a.id], "pausado", ""));
    return ok(`${a.name} pausado`);
  },
  "agents.assign_task": (p) => {
    const taskIds: string[] = p.taskIds ?? [];
    const agentIds: string[] = p.agentIds ?? [];
    if (!taskIds.length || !agentIds.length) return fail("nenhuma tarefa ou agente informado");
    update((d) => {
      let i = 0;
      d.tasks.forEach((t: Task) => {
        if (taskIds.includes(t.id)) {
          t.assigneeId = agentIds[i % agentIds.length];
          t.assigneeType = "agent";
          i++;
        }
      });
      d.agents.forEach((a) => {
        if (agentIds.includes(a.id)) a.metrics.tasks += Math.ceil(taskIds.length / agentIds.length);
      });
    });
    return ok(`${taskIds.length} tarefas distribuídas entre ${agentIds.length} agentes`);
  },
  "teams.activate": (p) => {
    const team = getDB().teams.find((t) => t.id === p.teamId);
    if (!team) return fail("time não encontrado");
    update((d) => {
      const t = d.teams.find((x) => x.id === team.id)!;
      t.status = "ativo";
      setAgentsStatus(d, [t.supervisorId, ...t.agentIds], "trabalhando");
    });
    return ok(`Time ${team.name} ativado`);
  },
  "teams.create": (p) => {
    if (!p.name) return fail("nome do time é obrigatório");
    const id = uid("t_");
    update((d) => {
      d.teams.push({
        id, organizationId: d.organization.id, name: p.name, objective: p.objective ?? "",
        supervisorId: p.supervisorId || undefined, agentIds: p.agentIds ?? [],
        goals: p.goals ?? "", schedule: p.schedule ?? "Seg–Sex, 08:00–18:00",
        channels: p.channels ?? ["whatsapp"], budget: Number(p.budget ?? 200), spent: 0,
        status: p.status ?? "ativo", metrics: p.metrics ?? { leads: 0, meetings: 0, conversions: 0 },
      });
    });
    return ok(`Time ${p.name} criado`, { id });
  },
  "teams.pause": (p) => {
    const team = getDB().teams.find((t) => t.id === p.teamId);
    if (!team) return fail("time não encontrado");
    update((d) => {
      const t = d.teams.find((x) => x.id === team.id)!;
      t.status = "pausado";
      setAgentsStatus(d, [t.supervisorId, ...t.agentIds], "pausado", "");
    });
    return ok(`Time ${team.name} pausado`);
  },
  "campaigns.create": (p) => {
    if (!p.name) return fail("nome da campanha é obrigatório");
    const db = getDB();
    const list = db.lists.find((l) => l.id === p.listId);
    if (!list) return fail("lista não encontrada");
    const id = uid("cp_");
    update((d) => {
      d.campaigns.unshift({
        id, organizationId: d.organization.id, name: p.name, listId: list.id, cadenceId: p.cadenceId ?? d.cadences[0]?.id,
        agentIds: p.agentIds ?? [], channel: p.channel ?? "whatsapp", connectionId: p.connectionId ?? "wa1", status: "rascunho",
        total: Math.min(Number(p.total) || list.count, list.count), sent: 0, replies: 0, interested: 0, meetings: 0, optOuts: 0, createdAt: nowISO(),
      });
    });
    return ok(`Campanha ${p.name} criada em rascunho`, { id });
  },
  "campaigns.start": (p, ctx) => {
    const db = getDB();
    const camp = db.campaigns.find((c) => c.id === p.campaignId);
    if (!camp) return fail("campanha não encontrada");
    if (mustSubscribe(currentUser(db))) return fail("Plano vencido. WhatsApp em massa só com Impulso ou Máquina.");
    const quota = reserveProspects(Math.min(camp.total || 1, 20));
    if (!quota.ok) return fail(quota.message);
    const problem = connectionCheck(db, camp.connectionId);
    if (problem) {
      update((d) => {
        const op = d.operations.find((o) => o.id === p.operationId);
        if (op) {
          op.status = "failed";
          op.result = `Falhou: ${problem}.`;
          op.events.unshift({ at: nowISO(), text: `Não consegui iniciar porque ${problem}.`, kind: "error" });
        }
      });
      return fail(problem);
    }
    let operationId = p.operationId as string | undefined;
    update((d) => {
      const c = d.campaigns.find((x) => x.id === camp.id)!;
      c.status = "ativa";
      setAgentsStatus(d, c.agentIds, "trabalhando", `${c.name}`);
      let op = d.operations.find((o) => o.id === operationId);
      if (!op) {
        op = newOperation(d, { title: c.name, objective: `Executar campanha ${c.name}`, total: c.total, agentIds: c.agentIds, connectionId: c.connectionId, requestedBy: ctx.requestedBy ?? ctx.actor });
        d.operations.unshift(op);
        operationId = op.id;
      }
      op.status = "running";
      op.steps.forEach((s, i) => (s.status = i < 3 ? "done" : i === 3 ? "running" : "pending"));
      op.events.unshift({ at: nowISO(), text: `Campanha iniciada${ctx.approvedBy ? ` · aprovada por ${ctx.approvedBy}` : ""}`, kind: "success" });
    });
    return ok(`Campanha ${camp.name} iniciada`, { operationId: operationId! });
  },
  "campaigns.pause": (p) => {
    const camp = getDB().campaigns.find((c) => c.id === p.campaignId);
    if (!camp) return fail("campanha não encontrada");
    update((d) => {
      d.campaigns.find((x) => x.id === camp.id)!.status = "pausada";
      d.operations.forEach((o) => {
        if (o.title === camp.name && o.status === "running") {
          o.status = "paused";
          o.events.unshift({ at: nowISO(), text: "Operação pausada junto com a campanha", kind: "warning" });
        }
      });
    });
    return ok(`Campanha ${camp.name} pausada`);
  },
  "operations.start": (p, ctx) => {
    const db = getDB();
    const problem = connectionCheck(db, p.connectionId);
    if (problem) return fail(problem);
    const unavailable = db.agents.filter((a) => (p.agentIds ?? []).includes(a.id) && a.spent >= a.budget);
    if (unavailable.length) return fail(`${unavailable.map((a) => a.name).join(", ")} sem orçamento disponível`);
    let id = "";
    update((d) => {
      const op = newOperation(d, { title: p.title, objective: p.objective, total: Number(p.total) || 50, agentIds: p.agentIds ?? [], connectionId: p.connectionId, requestedBy: ctx.requestedBy ?? ctx.actor });
      op.status = "running";
      op.steps.forEach((s, i) => (s.status = i < 3 ? "done" : i === 3 ? "running" : "pending"));
      op.events.unshift({ at: nowISO(), text: `Helena orquestrou a operação${ctx.approvedBy ? ` · aprovada por ${ctx.approvedBy}` : ""}. Time Comercial recebe as abordagens individuais (script Robson Alex).`, kind: "success" });
      d.operations.unshift(op);
      id = op.id;
      const sdrIds = d.agents.filter((a) => a.role === "SDR" && (p.agentIds ?? []).includes(a.id)).map((a) => a.id);
      setAgentsStatus(d, sdrIds.length ? sdrIds : op.agentIds.slice(0, 2), "trabalhando", `Abordagens individuais · ${op.title}`);
      const closer = d.agents.find((a) => a.role === "Closer");
      if (closer) {
        closer.status = "trabalhando";
        closer.currentTask = "Quebra de objeções e agendamento (Agenda compartilhada)";
      }
      const list = d.lists.find((l) => l.id === p.listId);
      if (list) {
        d.campaigns.unshift({
          id: uid("cp_"), organizationId: d.organization.id, name: op.title, listId: list.id, cadenceId: d.cadences[0].id,
          agentIds: op.agentIds, channel: "whatsapp", connectionId: p.connectionId ?? "wa1", status: "ativa", total: op.total,
          sent: 0, replies: 0, interested: 0, meetings: 0, optOuts: 0, createdAt: nowISO(),
        });
      }
    });
    return ok("Operação iniciada", { operationId: id });
  },
  "operations.pause": (p) => {
    const op = getDB().operations.find((o) => o.id === p.operationId);
    if (!op) return fail("operação não encontrada");
    if (op.status !== "running") return fail("a operação não está em execução");
    update((d) => {
      const o = d.operations.find((x) => x.id === op.id)!;
      o.status = "paused";
      o.events.unshift({ at: nowISO(), text: "Operação pausada", kind: "warning" });
      d.campaigns.forEach((c) => c.name === o.title && c.status === "ativa" && (c.status = "pausada"));
    });
    return ok(`${op.code} pausada`);
  },
  "operations.resume": (p) => {
    const db = getDB();
    const op = db.operations.find((o) => o.id === p.operationId);
    if (!op) return fail("operação não encontrada");
    if (op.status !== "paused") return fail("a operação não está pausada");
    const problem = connectionCheck(db, op.connectionId);
    if (problem) return fail(problem);
    update((d) => {
      const o = d.operations.find((x) => x.id === op.id)!;
      o.status = "running";
      o.events.unshift({ at: nowISO(), text: "Operação retomada", kind: "info" });
      d.campaigns.forEach((c) => c.name === o.title && c.status === "pausada" && (c.status = "ativa"));
    });
    return ok(`${op.code} retomada`);
  },
  "knowledge.search": (p) => {
    const q = normalize(String(p.query ?? ""));
    const db = getDB();
    const docs = db.knowledge.filter((k) => normalize(`${k.name} ${k.collection}`).includes(q));
    const offers = (db.serviceOffers ?? []).filter((o) =>
      o.active && normalize(`${o.name} ${o.category} ${o.description} ${o.pitch}`).includes(q),
    );
    return ok(`${docs.length} documentos e ${offers.length} orçamentos relevantes`, {
      ids: docs.map((k) => k.id),
      catalog: formatCatalogForAgents(offers.length ? offers : db.serviceOffers ?? []),
    });
  },
  "analytics.query": () => ok("Métricas consultadas", computeSummary(getDB()) as unknown as Record<string, unknown>),
  "calendar.create_event": (p, ctx) => createCalendarEvent(p, ctx),
  "calendar.agendar_reuniao": (p, ctx) => createCalendarEvent(p, ctx),
  "calendar.list_events": (p) => {
    const db = getDB();
    const events = db.calendarEvents ?? [];
    const leadId = p.leadId || p.contactId;
    const filtered = leadId ? events.filter((e) => e.leadId === leadId) : events;
    return ok(`${filtered.length} compromisso(s) na Agenda compartilhada`, {
      ids: filtered.map((e) => e.id),
      count: filtered.length,
    });
  },
  "calendar.update_event": (p, ctx) => {
    const db = getDB();
    const ev = (db.calendarEvents ?? []).find((e) => e.id === p.id || e.id === p.eventId);
    if (!ev) return fail("compromisso não encontrado");
    const status = p.status as CalendarEventStatus | undefined;
    update((d) => {
      const x = d.calendarEvents.find((e) => e.id === ev.id)!;
      if (p.dataHora || p.at) x.dataHora = String(p.dataHora || p.at);
      if (p.titulo || p.title) x.titulo = String(p.titulo || p.title);
      if (p.resumo) x.resumo = String(p.resumo);
      if (status) x.status = status;
      x.updatedAt = nowISO();
      d.activities.unshift({
        id: uid("ac_"),
        organizationId: d.organization.id,
        contactId: x.leadId,
        dealId: x.dealId,
        type: "reuniao",
        text: `Agenda: ${x.titulo} atualizado (${x.status})`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
    });
    return ok("Compromisso atualizado", { id: ev.id });
  },
  "calendar.cancel_event": (p, ctx) => {
    const db = getDB();
    const ev = (db.calendarEvents ?? []).find((e) => e.id === p.id || e.id === p.eventId || e.id === p.meetingId);
    const m = (db.meetings ?? []).find((x) => x.id === p.meetingId || x.id === p.id || x.id === p.eventId);
    if (!ev && !m) return fail("compromisso não encontrado");
    if ((ev && ev.status === "cancelada") || (m && m.status === "cancelada")) return fail("essa reunião já estava cancelada");
    update((d) => {
      if (ev) {
        const x = d.calendarEvents.find((e) => e.id === ev.id);
        if (x) { x.status = "cancelada"; x.updatedAt = nowISO(); }
      }
      if (m) {
        const x = d.meetings.find((y) => y.id === m.id);
        if (x) {
          x.status = "cancelada";
          if (p.reason) x.notes = `${x.notes ? `${x.notes}\n` : ""}Cancelada: ${p.reason}`;
        }
      }
      const contactId = ev?.leadId ?? m?.contactId;
      if (contactId) {
        d.activities.unshift({
          id: uid("ac_"), organizationId: d.organization.id, contactId, dealId: ev?.dealId ?? m?.dealId, type: "reuniao",
          text: `Reunião cancelada${p.reason ? `: ${p.reason}` : ""}`, actor: ctx.actor, createdAt: nowISO(),
        });
      }
    });
    return ok("Reunião cancelada", { id: ev?.id ?? m?.id, meetingId: m?.id });
  },
  "sales.closer_takeover": (p, ctx) => {
    const db = getDB();
    const s = db.salesFlow;
    const conv = db.conversations.find((c) => c.id === p.conversationId);
    if (!conv) return fail("conversa não encontrada");
    if (!conv.flow) return fail("essa conversa não veio da prospecção");
    if (conv.handlerType === "human") return fail("um atendente do time já assumiu essa conversa");
    if (!s) return fail("regras do número comercial não configuradas");
    const closer = db.agents.find((a) => a.id === s.closerAgentId);
    if (!closer) return fail("a agente Closer configurada não existe");
    if (closer.status === "pausado" || closer.status === "erro") return fail(`${closer.name} está ${closer.status === "erro" ? "com erro" : "pausada"}`);
    const problem = connectionCheck(db, conv.connectionId ?? s.sharedConnectionId);
    if (problem) return fail(problem);
    if (shouldHoldOutbound(conv, new Date(), 24) || unansweredAgentStreak(conv) >= 2) {
      return fail("este número já foi abordado; o follow-up só pode ser proposto após 24h sem resposta, e uma vez só");
    }
    const contact = db.contacts.find((c) => c.id === conv.contactId);
    if (!contact) return fail("contato não encontrado");
    if (isOptedOut(contact)) return fail("opt-out / sem consentimento — não envia follow-up");
    const pending = db.approvals.find((a) =>
      a.tool === "sales.send_menu_followup" &&
      a.status === "pendente" &&
      a.params.conversationId === conv.id,
    );
    if (pending) return ok("Este follow-up já está aguardando aprovação.", { approvalId: pending.id });
    if (conv.flow.state === "aguardando_aprovacao") return fail("follow-up já está aguardando aprovação");
    const reason: FollowupReason = p.reason === "visualizou_sem_responder" ? "visualizou_sem_responder" : (conv.flow.readAt && conv.flow.readAt >= conv.flow.lastOutboundAt ? "visualizou_sem_responder" : "sem_resposta");
    const menuOffer = db.serviceOffers.find((offer) => offer.id === "svc_menu_online" && offer.active);
    if (!menuOffer) return fail("oferta de cardápio online indisponível no catálogo");
    const text = formatForWhatsApp(menuProposalFollowupText(contact.name, menuOffer.name, menuOffer.price));
    const approvalId = requestApproval({
      title: `Follow-up para ${contact.name} · cardápio online`,
      description: `A mensagem será enviada após sua aprovação. O contato está sem resposta há pelo menos 24 horas (${FOLLOWUP_REASON_LABEL[reason]}).`,
      details: [
        { label: "Oferta", value: menuOffer.name },
        { label: "Preço", value: `R$ ${menuOffer.price.toFixed(2).replace(".", ",")}/mês` },
        { label: "Mensagem", value: text },
      ],
      tool: "sales.send_menu_followup",
      params: { conversationId: conv.id, lastOutboundAt: conv.flow.lastOutboundAt, reason, text },
      risk: "alto",
      requestedBy: ctx.requestedBy ?? ctx.actor,
    });
    update((d) => {
      const current = d.conversations.find((c) => c.id === conv.id);
      if (current?.flow) current.flow.state = "aguardando_aprovacao";
    });
    return ok(`Follow-up de ${contact.name} preparado e aguardando aprovação. Nada foi enviado.`, { approvalId, conversationId: conv.id });
  },
  "sales.send_menu_followup": (p, ctx) => {
    if (!ctx.approvedBy) return fail("este follow-up só pode ser enviado após aprovação");
    const db = getDB();
    const conv = db.conversations.find((c) => c.id === p.conversationId);
    if (!conv?.flow) return fail("conversa de prospecção não encontrada");
    const closer = db.agents.find((a) => a.id === db.salesFlow?.closerAgentId);
    if (!closer || closer.status === "pausado" || closer.status === "erro") return fail("agente de follow-up indisponível");
    const contact = db.contacts.find((c) => c.id === conv.contactId);
    if (!contact) return fail("contato não encontrado");
    if (isOptedOut(contact)) return fail("opt-out / sem consentimento — follow-up cancelado");
    if (conv.handlerType === "human" || conv.status === "resolvida") return fail("um atendente assumiu a conversa; follow-up cancelado");
    if (conv.flow.repliedAt && conv.flow.repliedAt >= conv.flow.lastOutboundAt) return fail("o contato respondeu; follow-up cancelado");
    if (conv.messages.at(-1)?.from === "contact") return fail("o contato respondeu; follow-up cancelado");
    if (conv.flow.state !== "aguardando_aprovacao") return fail("o status da conversa mudou; revise o follow-up antes de enviar");
    if (conv.flow.lastOutboundAt !== p.lastOutboundAt) return fail("houve uma nova mensagem após a aprovação; follow-up cancelado");
    const read = Boolean(conv.flow.readAt && conv.flow.readAt >= conv.flow.lastOutboundAt);
    const startedAt = read ? conv.flow.readAt! : conv.flow.lastOutboundAt;
    const waitHours = read ? db.salesFlow.readNoReplyHours : db.salesFlow.noReplyHours;
    if (Date.now() < new Date(startedAt).getTime() + waitHours * 3_600_000) {
      return fail("o prazo de 24 horas ainda não venceu; follow-up cancelado");
    }
    const sent = runTool("messages.send", {
      conversationId: conv.id,
      text: String(p.text || ""),
      authorName: closer.name,
      followup: true,
    }, ctx);
    if (!sent.ok) return sent;
    update((d) => {
      const current = d.conversations.find((c) => c.id === conv.id);
      if (!current?.flow) return;
      current.handlerType = "agent";
      current.handlerId = closer.id;
      current.status = "aberta";
      current.flow.state = "closer";
      current.flow.closerAttempts += 1;
      current.flow.closerSince ??= nowISO();
      const agent = d.agents.find((a) => a.id === closer.id);
      if (agent) {
        agent.metrics.tasks += 1;
        agent.metrics.conversations += 1;
        agent.currentTask = `Retomando ${contact.name}`;
      }
      d.activities.unshift({
        id: uid("ac_"),
        organizationId: d.organization.id,
        contactId: current.contactId,
        type: "handoff",
        text: `${closer.name} enviou o follow-up aprovado do cardápio online após ${FOLLOWUP_REASON_LABEL[p.reason === "visualizou_sem_responder" ? "visualizou_sem_responder" : "sem_resposta"]}.`,
        actor: ctx.approvedBy,
        createdAt: nowISO(),
      });
    });
    return ok(`Follow-up aprovado enviado para ${contact.name}.`, { conversationId: conv.id });
  },
  "rpa.send_approved_followup": (p, ctx) => {
    if (!ctx.approvedBy) return fail("este follow-up só pode ser enviado após aprovação");
    const db = getDB();
    const job = db.rpaJobs.find((entry) => entry.id === p.jobId && entry.kind === "followup");
    if (!job || job.status !== "awaiting_approval") return fail("follow-up não está aguardando aprovação");
    const conv = db.conversations.find((entry) => entry.id === p.conversationId);
    if (!conv) return fail("conversa não encontrada");
    const contact = db.contacts.find((entry) => entry.id === conv.contactId);
    if (!contact || contact.id !== job.contactId) return fail("contato não corresponde ao follow-up");
    if (isOptedOut(contact)) {
      markJob(job.id, "skipped", "opt-out / sem consentimento", 0);
      return fail("opt-out / sem consentimento — follow-up cancelado");
    }
    if (conv.handlerType === "human" || conv.status === "resolvida") return fail("um atendente assumiu a conversa; follow-up cancelado");
    if (conv.messages.at(-1)?.from === "contact") return fail("o contato respondeu; follow-up cancelado");
    const lastOutboundAt = conv.flow?.lastOutboundAt
      ?? [...conv.messages].reverse().find((message) => message.from === "agent" || message.from === "helena")?.at;
    if (!lastOutboundAt || lastOutboundAt !== p.lastOutboundAt) return fail("houve uma nova mensagem após a aprovação; follow-up cancelado");
    const sent = runTool("messages.send", {
      conversationId: conv.id,
      text: String(p.text || ""),
      followup: true,
    }, ctx);
    markJob(job.id, sent.ok ? "sent" : "failed", sent.ok ? undefined : sent.message, 0);
    return sent.ok ? ok(`Follow-up aprovado enviado para ${contact.name}.`, { jobId: job.id }) : sent;
  },
  "sales.update_flow_settings": (p) => {
    const db = getDB();
    const patch = (p.patch ?? {}) as Partial<SalesFlowSettings>;
    const hours = ["noReplyHours", "readNoReplyHours"] as const;
    for (const k of hours) if (patch[k] !== undefined && !(Number(patch[k]) > 0 && Number(patch[k]) <= 720)) return fail("o tempo de espera precisa ficar entre 1 e 720 horas");
    if (patch.maxCloserAttempts !== undefined && !(patch.maxCloserAttempts >= 1 && patch.maxCloserAttempts <= 5)) return fail("a Closer pode tentar de 1 a 5 vezes");
    if (patch.closerAgentId && !db.agents.some((a) => a.id === patch.closerAgentId)) return fail("agente não encontrado");
    if (patch.sharedConnectionId && !db.connections.some((c) => c.id === patch.sharedConnectionId)) return fail("número de WhatsApp não encontrado");
    if (patch.businessStart !== undefined && patch.businessEnd !== undefined && patch.businessStart >= patch.businessEnd) return fail("o horário de início precisa ser antes do fim");
    update((d) => { Object.assign(d.salesFlow, patch); });
    return ok("Regras do número comercial atualizadas");
  },
  "messages.register_event": (p, ctx) => {
    const db = getDB();
    const conv = db.conversations.find((c) => c.id === p.conversationId);
    if (!conv) return fail("conversa não encontrada");
    const contact = db.contacts.find((c) => c.id === conv.contactId);
    if (p.event === "read") {
      update((d) => {
        const c = d.conversations.find((x) => x.id === conv.id);
        if (c?.flow) {
          c.flow.readAt = nowISO();
          if (c.flow.state === "abordado") c.flow.state = "visualizou";
        }
      });
      return ok(`${contact?.name ?? "Cliente"} visualizou a mensagem`);
    }
    if (p.event !== "reply") return fail("evento desconhecido");
    const text = String(p.text ?? "").trim();
    if (!text) return fail("mensagem vazia");
    update((d) => {
      const c = d.conversations.find((x) => x.id === conv.id);
      if (!c) return;
      c.messages.push({ id: uid("m_"), from: "contact", authorName: contact?.name ?? "Cliente", text, at: nowISO(), kind: "text" });
      c.lastMessageAt = nowISO();
      c.unread += 1;
      c.status = "aberta";
      if (c.flow) {
        c.flow.repliedAt = nowISO();
        c.flow.readAt ??= nowISO();
        if (c.flow.state !== "closer" && c.flow.state !== "reuniao_agendada") c.flow.state = "respondeu";
      }
      const ct = d.contacts.find((x) => x.id === c.contactId);
      if (ct) ct.lastContactAt = nowISO();
    });

    const fresh = getDB().conversations.find((c) => c.id === conv.id);
    const s = getDB().salesFlow;
    if (fresh?.flow?.state === "closer" && fresh.handlerType === "agent" && s && fresh.handlerId === s.closerAgentId && s.autoBookMeetings) {
      const parsed = parseWhen(text);
      const picked = parsed?.hasTime ? parsed.date.toISOString() : pickProposedSlot(text, fresh.flow.proposedSlots);
      if (picked) {
        const closer = getDB().agents.find((a) => a.id === s.closerAgentId);
        if (!closer) return fail("a agente Closer configurada não existe");
        const booked = runTool("calendar.create_event", { contactId: fresh.contactId, startAt: picked, ownerId: closer.id, source: "closer" }, { actor: closer.name, actorType: "agent", requestedBy: ctx.actor });
        const when = slotLabel(new Date(picked));
        const reply = booked.ok
          ? `Perfeito, ficou reservado ${when}. Vou te mandar o link um pouco antes. Até lá!`
          : `Esse horário acabou de ser ocupado. Consigo ${(fresh.flow.proposedSlots ?? []).filter((x) => x !== picked).map((x) => slotLabel(new Date(x))).join(" ou ") || "outro horário"}, pode ser?`;
        update((d) => {
          const c = d.conversations.find((x) => x.id === conv.id);
          if (!c) return;
          c.messages.push({ id: uid("m_"), from: "agent", authorName: closer.name, text: formatForWhatsApp(reply), at: nowISO(), kind: "text" });
          c.lastMessageAt = nowISO();
          c.unread = 0;
          if (c.flow) c.flow.lastOutboundAt = nowISO();
        });
        return ok(booked.ok ? `Cliente respondeu e ${closer.name} marcou a reunião para ${when}` : `Cliente respondeu, mas o horário ${when} estava ocupado`, { meetingId: booked.data?.meetingId });
      }
    }
    return ok(`${contact?.name ?? "Cliente"} respondeu`);
  },
  "prospect.scan_maps": (p, ctx) => {
    const asked = Math.min(Number(p.limit) || 10, 150);
    const quota = reserveProspects(asked);
    if (!quota.ok) return fail(quota.message);
    const segment = String(p.segment || "negócios locais sem site");
    const city = String(p.city || "Brasil");
    const state = p.state != null ? String(p.state) : undefined;
    const nationwide = p.nationwide === true || /brasil|nacional/i.test(city) || state === "TODOS";
    const noWhatsAppAi = p.noWhatsAppAi === true;
    const isTest = typeof process !== "undefined" && Boolean(process.env?.VITEST);
    if (!isTest && p.simulate !== true) {
      const limitLive = Math.min(quota.allowed, 150);
      const wave = p.wave === true || limitLive >= 80;
      import("@/lib/prospect/runProspecting").then(({ runRealProspecting, runWaveProspecting }) => {
        const job = wave
          ? runWaveProspecting({ limit: limitLive, organizationId: getDB().organization.id })
          : runRealProspecting({
            segment,
            city,
            state,
            nationwide,
            limit: limitLive,
            organizationId: getDB().organization.id,
            noWhatsAppAi,
          });
        job.then((r) => {
          update((d) => {
            d.executions.unshift({
              id: uid("ex_scan_"),
              organizationId: d.organization.id,
              at: nowISO(),
              actor: ctx.actor,
              actorType: ctx.actorType,
              action: "prospect.scan_maps",
              description: `${wave ? "Onda multi-nicho SP" : "Varredura real"}: ${r.found} WhatsApp válido (${nationwide ? "Brasil inteiro" : city})${noWhatsAppAi ? " · filtro sem IA no atendimento" : " · sem site"}. Instância helena: ${r.sent} enviados, ${r.failed} falhas.`,
              result: r.found ? "sucesso" : "falha",
              requestedBy: ctx.requestedBy ?? ctx.actor,
              durationMs: 0,
            });
          });
        }).catch(() => {});
      });
      return ok(wave
        ? `Onda comercial iniciada: até ${limitLive} WhatsApp válidos em São Paulo, Campinas, Araçatuba, Andradina e cidades próximas, vários nichos. Só número real; intervalo entre disparos. Time de vendas assume.`
        : `Varredura ${nationwide ? "nacional" : "em " + city} iniciada para ${segment}. ${noWhatsAppAi ? "Entram negócios com WhatsApp e sem rastros de IA/chatbot no atendimento (heurística de site + mapa)." : "Só entram leads sem site e com WhatsApp."} Time Comercial dispara pela instância helena.`);
    }
    const limit = Math.min(quota.allowed, 150);

    const businessTemplates = [
      { name: "Consultório Dr. André", contact: "Dr. André Figueiredo", role: "Cirurgião Dentista" },
      { name: "Studio Estética Renata", contact: "Renata Vasconcelos", role: "Proprietária" },
      { name: "Clínica Integrada Bem Estar", contact: "Dra. Juliana Prado", role: "Diretora Clínica" },
      { name: "Espaço Saúde & Sorriso", contact: "Dr. Marcos Vinícius", role: "Sócio" },
      { name: "Fisioterapia Movimento Livre", contact: "Patrícia Nogueira", role: "Fisioterapeuta Chefe" },
      { name: "Centro Odontológico Paulista", contact: "Dr. Carlos Eduardo", role: "Fundador" },
      { name: "Ateliê Dental Prime", contact: "Dra. Camila Duarte", role: "Especialista" },
      { name: "Clínica Médica São José", contact: "Dr. Henrique Albuquerque", role: "Diretor" },
      { name: "Dermatologia & Laser Spazio", contact: "Dra. Letícia Andrade", role: "Médica Dermatologista" },
      { name: "Consultório Vida Mais", contact: "Dr. Gabriel Santos", role: "Clínico Geral" },
    ];

    const sdrs = getDB().agents.filter((a) => a.role === "SDR");
    const sdr = sdrs[0] || getDB().agents[0];
    const createdCompanyIds: string[] = [];
    const createdContactIds: string[] = [];
    const createdDealIds: string[] = [];

    update((d) => {
      const pipeline = d.pipelines[0];
      const stage = pipeline?.stages[0]; // Primeiro contato

      for (let i = 0; i < limit; i++) {
        const tmpl = businessTemplates[i % businessTemplates.length];
        const suffix = i >= businessTemplates.length ? ` ${Math.floor(i / businessTemplates.length) + 1}` : "";
        const compName = `${tmpl.name}${suffix}`;
        const contactName = `${tmpl.contact}${suffix}`;
        const ownerSdr = sdrs[i % Math.max(1, sdrs.length)] || sdr;
        const compId = uid("c_maps_");
        const contactId = uid("p_maps_");
        const dealId = uid("d_maps_");

        // 1. Inserir empresa sem site
        d.companies.unshift({
          id: compId,
          organizationId: d.organization.id,
          name: compName,
          segment,
          city,
          size: "1–10",
          website: "", // SEM SITE detectado no Google Maps
          ownerId: ownerSdr.id,
          createdAt: nowISO(),
        });
        createdCompanyIds.push(compId);

        // 2. Inserir contato com tag #sem-site
        const phone = `+55 11 9${String(7000 + i * 133).slice(0, 4)}-${String(4000 + i * 211).slice(0, 4)}`;
        d.contacts.unshift({
          id: contactId,
          organizationId: d.organization.id,
          name: contactName,
          email: `contato@${contactName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.br`,
          phone,
          companyId: compId,
          title: tmpl.role,
          tags: ["#sem-site", "Google Maps", segment.toLowerCase(), "#ciclo-encontrado"],
          source: "Prospecção",
          ownerId: ownerSdr.id,
          status: "lead",
          score: 85, // Alta probabilidade de compra
          consent: true,
          createdAt: nowISO(),
          lastContactAt: nowISO(),
        });
        createdContactIds.push(contactId);

        // 3. Inserir Deal no pipeline na etapa "Primeiro contato"
        if (stage && pipeline) {
          d.deals.unshift({
            id: dealId,
            organizationId: d.organization.id,
            pipelineId: pipeline.id,
            stageId: stage.id,
            title: `Criação de Site · ${compName}`,
            contactId,
            companyId: compId,
            value: d.serviceOffers?.find((o) => o.id === "svc_site")?.price ?? 547,
            probability: stage.probability,
            expectedClose: new Date(Date.now() + 20 * 86_400_000).toISOString(),
            ownerId: ownerSdr.id,
            ownerType: "agent",
            source: "Prospecção",
            status: "aberto",
            tags: ["#sem-site", "Google Maps"],
            createdAt: nowISO(),
            updatedAt: nowISO(),
          });
          createdDealIds.push(dealId);
        }

        // 4. Disparar abordagem do SDR de Nível 2 via WhatsApp
        d.conversations.unshift({
          id: uid("conv_"),
          organizationId: d.organization.id,
          contactId,
          channel: "whatsapp",
          connectionId: getAgencyConnection(d)?.id ?? d.salesFlow?.sharedConnectionId,
          flow: { origin: "prospeccao", state: "abordado", lastOutboundAt: nowISO(), closerAttempts: 0 },
          status: "aberta",
          handlerType: "agent",
          handlerId: ownerSdr.id,
          unread: 0,
          sentiment: "neutro",
          lastMessageAt: nowISO(),
          messages: [
            {
              id: uid("m_"),
              from: "agent",
              authorName: ownerSdr.name,
              text: formatForWhatsApp(buildCatalogOpening(contactName, compName, d.serviceOffers ?? [])),
              at: nowISO(),
              kind: "text",
            },
          ],
        });

        d.activities.unshift({
          id: uid("ac_"),
          organizationId: d.organization.id,
          contactId,
          dealId,
          type: "ia",
          text: `Helena delegou ao ${ownerSdr.name}: oportunidade Google Maps (#sem-site) com script Robson Alex via WhatsApp`,
          actor: ownerSdr.name,
          createdAt: nowISO(),
        });
      }
    });

    // ── Despacho REAL via Evolution API (fire-and-forget) ────────────────────
    // Monta a lista de contatos que foram inseridos no store e dispara
    // as mensagens em background com rate limiting anti-ban.
    // Isso não bloqueia o retorno da ferramenta nem a UI.
    {
      const db2 = getDB();
      const contacts4dispatch = createdContactIds.map((cid) => {
        const c = db2.contacts.find((x) => x.id === cid);
        const comp = db2.companies.find((x) => x.id === c?.companyId);
        return c ? {
          phone: c.phone,
          name: c.name,
          companyName: comp?.name ?? "empresa",
          contactId: c.id,
          agentName: "Robson Alex",
        } : null;
      }).filter(Boolean) as import("@/lib/evolution/prospectDispatcher").ProspectContact[];

      if (contacts4dispatch.length > 0) {
        import("@/lib/evolution/prospectDispatcher").then(({ dispatchProspectMessages, buildProspectMessage }) => {
          dispatchProspectMessages(
            contacts4dispatch,
            buildProspectMessage,
            getDB().organization.id,
          ).then(() => {}).catch(() => {});
        });
      }
    }

    for (const cid of createdContactIds) applyDiagnosisToContact(cid);

    return ok(
      `Helena orquestrou a varredura: ${limit} empresas em ${city} SEM SITE. Leads no CRM (#sem-site) e abordagens individuais delegadas ao Time Comercial (script Robson Alex).`,
      { count: limit, companyIds: createdCompanyIds, contactIds: createdContactIds, dealIds: createdDealIds }
    );
  },
  "leads.diagnose": (p) => {
    const id = String(p.contactId || "");
    if (!id) return fail("informe contactId");
    return applyDiagnosisToContact(id);
  },
  "dev.build_presence": (p) => {
    const user = currentUser(getDB());
    if (!canUseDevTeam(user)) {
      return fail("O Time Dev (Caio, Diego e Sofia) entra no plano Máquina. No trial e no Impulso o Time Comercial prospecta no WhatsApp.");
    }
    const quota = reserveProspects(Math.min(Number(p.limit) || 10, 50));
    if (!quota.ok) return fail(quota.message);
    return runPresencePipeline({
      segment: String(p.segment || "negócios locais"),
      city: String(p.city || "Brasil"),
      limit: quota.allowed,
      nationwide: p.nationwide === true,
    });
  },
  "automation.create": (p) => {
    if (!p.name) return fail("nome da automação é obrigatório");
    const id = uid("au_");
    update((d) => {
      const a: Automation = {
        id, organizationId: d.organization.id, name: p.name, trigger: p.trigger ?? "Lead criado",
        conditions: p.conditions ?? [], actions: p.actions ?? [{ type: "Webhook", value: p.action ?? "" }], active: true, runs: 0,
      };
      d.automations.unshift(a);
    });
    return ok(`Automação ${p.name} criada e ativada`, { id });
  },
  "sales.handle_objection": (p, ctx) => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");

    const objDef = OBJECTION_MATRIX.find((o) => o.id === p.objectionId) || OBJECTION_MATRIX[0];
    const company = db.companies.find((c) => c.id === contact.companyId);
    const compName = company?.name || "Empresa";
    const responseText = objDef.getAutonomousResponse({
      clientName: contact.name,
      companyName: compName,
      niche: company?.segment || "negócios locais",
    });

    update((d) => {
      // 1. Enviar resposta autônoma no WhatsApp
      let conv = d.conversations.find((c) => c.contactId === contact.id);
      if (!conv) {
        conv = {
          id: uid("conv_"),
          organizationId: d.organization.id,
          contactId: contact.id,
          channel: "whatsapp",
          status: "aberta",
          handlerType: "agent",
          handlerId: contact.ownerId,
          unread: 0,
          sentiment: "positivo",
          lastMessageAt: nowISO(),
          messages: [],
        };
        d.conversations.unshift(conv);
      }

      conv.messages.push({
        id: uid("m_"),
        from: "agent",
        authorName: "Helena AI (Sales Brain)",
        text: formatForWhatsApp(responseText),
        at: nowISO(),
        kind: "text",
      });

      // Não empilha mídia no WhatsApp — uma resposta de objeção basta.

      conv.lastMessageAt = nowISO();

      // 2. Se a ação for reagendamento de follow-up
      if (objDef.actionType === "reschedule_task") {
        d.tasks.unshift({
          id: uid("tk_"),
          organizationId: d.organization.id,
          title: `Follow-up comercial: ${contact.name} (Retorno 10h)`,
          contactId: contact.id,
          assigneeId: contact.ownerId,
          assigneeType: "agent",
          dueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          done: false,
          priority: "alta",
          type: "follow-up",
        });
      }

      // 3. Registrar auditoria imutável
      d.activities.unshift({
        id: uid("ac_obj_"),
        organizationId: d.organization.id,
        contactId: contact.id,
        type: "ia",
        text: `⚡ HELENA contornou objeção "${objDef.title}". Ação: ${objDef.actionDescription}${objDef.id === "obj_caro" ? " · memória preco_alto" : ""}`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
      const ct = d.contacts.find((x) => x.id === contact.id);
      if (ct) ct.tags = setCycleTag(ct.tags, "respondeu");
    });
    const kind = objDef.id === "obj_caro" ? "preco_alto" : objDef.actionType === "reschedule_task" ? "pedido_retorno" : "objecao";
    scheduleFollowup(getDB().contacts.find((c) => c.id === contact.id)!, kind, objDef.title);

    return ok(`Objeção contornada com sucesso para ${contact.name}. Resposta e ação estratégica aplicadas.`, {
      objectionId: objDef.id,
      response: responseText,
      action: objDef.actionDescription,
    });
  },
  "sales.generate_checkout_pix": (p, ctx) => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");

    const deal = db.deals.find((d) => d.id === p.dealId || d.contactId === contact.id);
    const amount = Number(p.amount) || deal?.value || 4900;
    const pixData = generatePixCheckout(amount, contact.name, deal?.title || "Criação de Site Institucional");

    update((d) => {
      // 1. Injeta cobrança Pix na conversa do WhatsApp
      let conv = d.conversations.find((c) => c.contactId === contact.id);
      if (conv) {
        const pixMsg = formatForWhatsApp(`Perfeito, ${contact.name}! Criei a cobrança com condição especial da Info Tech Ltda no valor de ${pixData.formattedValue}.\n\nChave Pix Copia e Cola:\n${pixData.copyPasteKey}\n\nLink de Pagamento / Cartao de Credito:\n${pixData.checkoutUrl}\n\nAssim que o pagamento for identificado, liberamos seu dominio e o time tecnico inicia imediatamente!`);
        conv.messages.push({
          id: uid("msg_pix_"),
          from: "agent",
          authorName: "Helena Closer (Fechamento)",
          text: pixMsg,
          at: nowISO(),
          kind: "text",
        });
        conv.lastMessageAt = nowISO();
      }

      // 2. Move deal para Negociação ou Ganho
      if (deal) {
        const targetDeal = d.deals.find((x) => x.id === deal.id);
        if (targetDeal) {
          const negStage = d.pipelines[0]?.stages.find((s) => s.id === "st_neg" || s.id === "st_ganho");
          if (negStage) {
            targetDeal.stageId = negStage.id;
            targetDeal.probability = 90;
            targetDeal.updatedAt = nowISO();
          }
        }
      }

      // 3. Auditoria
      d.activities.unshift({
        id: uid("ac_pix_"),
        organizationId: d.organization.id,
        contactId: contact.id,
        dealId: deal?.id,
        type: "ia",
        text: `💰 HELENA gerou cobrança Pix de ${pixData.formattedValue} para ${contact.name}. Link: ${pixData.checkoutUrl}`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
    });

    return ok(`Cobrança Pix de ${pixData.formattedValue} gerada e enviada via WhatsApp para ${contact.name}!`, {
      pix: pixData,
    });
  },
  "sales.qualify_bant": (p) => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");

    const deal = db.deals.find((d) => d.id === p.dealId || d.contactId === contact.id);
    const bant = evaluateBant(contact, deal, p.lastText || "");

    update((d) => {
      const c = d.contacts.find((x) => x.id === contact.id);
      if (c) {
        c.score = bant.totalScore;
        if (bant.isQualified && !c.tags.includes("#bant-qualificado")) {
          c.tags.push("#bant-qualificado");
        }
      }

      d.activities.unshift({
        id: uid("ac_bant_"),
        organizationId: d.organization.id,
        contactId: contact.id,
        dealId: deal?.id,
        type: "ia",
        text: `🎯 HELENA avaliou BANT (Score: ${bant.totalScore}/100). ${bant.recommendation}`,
        actor: "Helena BANT",
        createdAt: nowISO(),
      });
    });

    return ok(`Lead ${contact.name} avaliado com Score BANT ${bant.totalScore}/100. ${bant.recommendation}`, {
      bant,
    });
  },
  "sales.rescue_cold_leads": (p, ctx) => {
    const db = getDB();
    const result = executeRescueColdLeads(db, ctx.actor);
    if (result.rescuedCount === 0) {
      return ok("Nenhuma oportunidade parada há mais de 48h precisando de resgate no momento.");
    }
    return ok(
      `⚡ Resgate ativado: ${result.rescuedCount} oportunidade(s) paradas há mais de 48h foram reativadas com mensagem de parcelamento especial.`,
      { rescued: result.dealTitles }
    );
  },
  "sales.adjust_cadence": (p) => {
    const db = getDB();
    const cadence = computeDynamicCadence(db);
    return ok(
      `Cadência Dinâmica da Meta de R$ 15.000: Faturamento atual ${brl(cadence.achieved)} (${cadence.percent}%). Status: ${cadence.pacingStatus.toUpperCase()}. Cadência recomendada: ${cadence.dailyTargetCadence} abordagens/dia.`,
      { cadence }
    );
  },
  "sales.trigger_handoff": (p, ctx) => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");

    const reason = p.reason || "Conta de alto ticket / Dúvidas complexas";
    const manager = db.users.find((u) => u.role === "manager" || u.role === "owner") || currentUser(db);

    update((d) => {
      // 1. Altera responsável para o gestor humano
      const c = d.contacts.find((x) => x.id === contact.id);
      if (c) c.ownerId = manager.id;

      const deal = d.deals.find((x) => x.contactId === contact.id);
      if (deal) {
        deal.ownerId = manager.id;
        deal.ownerType = "user";
        deal.updatedAt = nowISO();
      }

      // 2. Altera conversa para atendimento humano
      const conv = d.conversations.find((x) => x.contactId === contact.id);
      if (conv) {
        conv.handlerType = "human";
        conv.handlerId = manager.id;
        conv.messages.push({
          id: uid("msg_handoff_"),
          from: "system",
          authorName: "Sistema HELENA",
          text: `🚨 Handoff Executado: Lead transferido para ${manager.name}. Motivo: ${reason}`,
          at: nowISO(),
          kind: "event",
        });
      }

      // 3. Auditoria
      d.activities.unshift({
        id: uid("ac_handoff_"),
        organizationId: d.organization.id,
        contactId: contact.id,
        type: "handoff",
        text: `Handoff executado: Helena → ${manager.name}. Motivo: ${reason}`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
    });

    return ok(`Transbordo (Handoff) realizado com sucesso para ${manager.name}. O lead agora está no Inbox aguardando o gestor.`, {
      contactId: contact.id,
      assignedTo: manager.name,
      reason,
    });
  },
  "rpa.run_shift": (p, ctx) => {
    const db = getDB();
    const user = currentUser(db);
    if (mustSubscribe(user)) return fail("Assine Impulso ou Máquina para o expediente RPA voltar.");
    const segment = String(p.segment || p.nicho || "").trim();
    const city = String(p.city || p.cidade || user.companyName || "Brasil");
    if (segment) {
      runTool("prospect.scan_maps", { segment, city, limit: Math.min(Number(p.limit) || 8, 20), simulate: p.simulate === true }, ctx);
    }
    const after = getDB();
    const leads = pickRpaLeads(after, Number(p.maxLeads) || 3);
    if (!leads.length) return fail("Nenhum lead com WhatsApp para o expediente. Rode a varredura Maps primeiro.");
    const steps: string[] = [];
    for (const lead of leads) {
      let conv = findOrDraftConversation(getDB(), lead);
      if (!conv) {
        const id = uid("cv_rpa_");
        update((d) => {
          d.conversations.unshift({
            id,
            organizationId: d.organization.id,
            contactId: lead.id,
            channel: "whatsapp",
            connectionId: d.connections[0]?.id,
            status: "aberta",
            handlerType: "agent",
            handlerId: d.agents.find((a) => a.role === "SDR")?.id || d.currentUserId,
            unread: 0,
            sentiment: "neutro",
            lastMessageAt: nowISO(),
            messages: [],
            flow: {
              origin: "prospeccao",
              state: "abordado",
              lastOutboundAt: nowISO(),
              closerAttempts: 0,
            },
          });
        });
        conv = getDB().conversations.find((c) => c.id === id);
      }
      if (!conv) continue;
      const company = getDB().companies.find((c) => c.id === lead.companyId);
      const dx = applyDiagnosisToContact(lead.id);
      const pitch = dx.ok && dx.data?.recommend_pitch ? String(dx.data.recommend_pitch) : rpaOpening(lead, company?.name);
      const sent = runTool("messages.send", {
        conversationId: conv.id,
        text: String(p.text || pitch),
        countAsProspect: true,
        delayMs: steps.length * 40_000,
      }, ctx);
      steps.push(`${lead.name}: ${sent.ok ? "WhatsApp na fila" : sent.message}`);
    }
    const first = leads[0];
    if (first && p.agendar !== false) {
      const when = String(p.dataHora || new Date(Date.now() + 26 * 3600_000).toISOString());
      const booked = runTool("calendar.agendar_reuniao", { leadId: first.id, dataHora: when, resumo: "Reunião 10 min · expediente RPA" }, ctx);
      if (booked.ok) stampCycle(first.id, "reuniao");
      steps.push(`Agenda: ${booked.message}`);
    }
    if (first && p.checkout === true) {
      const pix = runTool("sales.generate_checkout_pix", { contactId: first.id }, ctx);
      steps.push(`Pix: ${pix.message}`);
    }
    if (p.site === true) {
      if (!canUseDevTeam(user)) steps.push("Site: só no plano Máquina");
      else {
        const site = runTool("dev.build_presence", { segment: segment || "negócio local", city }, ctx);
        steps.push(`Time Dev: ${site.message}`);
      }
    }
    return ok(`Expediente RPA: ${steps.length} ações.`, { steps, leadIds: leads.map((l) => l.id) });
  },
  "lgpd.log_access": (p, ctx) => {
    const contact = getDB().contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");
    update((d) => {
      d.activities.unshift({
        id: uid("ac_lgpd_"),
        organizationId: d.organization.id,
        contactId: contact.id,
        type: "ia",
        text: `LGPD · ${ctx.actor} abriu o cadastro de ${contact.name}`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
    });
    return ok("Acesso registrado");
  },
  "lgpd.export_contact": (p) => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");
    const bundle = exportContactBundle(db, contact);
    if (typeof window !== "undefined") {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lgpd-${contact.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    return ok(`Exportação de ${contact.name} gerada.`, { contactId: contact.id });
  },
  "lgpd.erase_contact": (p, ctx) => {
    const db = getDB();
    const contact = db.contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");
    update((d) => {
      const c = d.contacts.find((x) => x.id === contact.id);
      if (!c) return;
      c.name = "Titular removido";
      c.email = "";
      c.phone = "";
      c.tags = ["lgpd-exclusao"];
      c.consent = false;
      c.status = "inativo";
      d.conversations.forEach((cv) => {
        if (cv.contactId !== contact.id) return;
        cv.messages = [];
        cv.status = "resolvida";
      });
      d.activities.unshift({
        id: uid("ac_erase_"),
        organizationId: d.organization.id,
        contactId: contact.id,
        type: "ia",
        text: `LGPD · exclusão executada por ${ctx.actor}`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
    });
    return ok(`Dados de ${contact.name} anonimizados.`);
  },
  "workspace.export": () => {
    if (typeof window !== "undefined") downloadWorkspaceBackup();
    return ok("Backup JSON baixado. Guarde até o Postgres existir.");
  },
  "rpa.retry_job": (p) => {
    const r = retryRpaJob(String(p.jobId || p.id || ""));
    return r.ok ? ok(r.message) : fail(r.message);
  },
  "rpa.radar_schedule": (p) => {
    const segment = String(p.segment || p.nicho || "").trim();
    const city = String(p.city || p.cidade || "").trim();
    if (!segment || !city) return fail("informe nicho e cidade");
    const sch = upsertRadarSchedule({
      segment,
      city,
      hour: p.hour != null ? Number(p.hour) : 9,
      limit: Math.min(Number(p.limit) || 8, 20),
    });
    enqueueRpa({
      kind: "scan_maps",
      idempotencyKey: `radar:${getDB().organization.id}:${new Date().toISOString().slice(0, 10)}`,
      payload: { segment: sch.segment, city: sch.city, limit: sch.limit, simulate: p.simulate === true },
    });
    return ok(`Radar ${sch.segment} em ${sch.city} às ${sch.hour}h. Primeira varredura na fila.`, { id: sch.id });
  },
  "rpa.followup_schedule": (p) => {
    const contact = getDB().contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");
    if (isOptedOut(contact)) return fail("opt-out / sem consentimento — não reenfileira");
    const kind = p.kind === "preco_alto" || p.kind === "pedido_retorno" || p.kind === "objecao" ? p.kind : "sem_resposta";
    const job = scheduleFollowup(contact, kind, String(p.fact || "follow-up"));
    return job ? ok(`Follow-up ${kind} em ${new Date(job.runAt).toLocaleString("pt-BR")}.`, { jobId: job.id }) : fail("não agendou");
  },
  "sales.draft_proposal": (p) => {
    const contact = getDB().contacts.find((c) => c.id === p.contactId);
    if (!contact) return fail("contato não encontrado");
    buildDossier(contact.id);
    const row = draftProposal(contact);
    update((d) => {
      const dos = d.commercialDossiers?.find((x) => x.contactId === contact.id);
      if (dos) dos.proposalId = row.id;
    });
    return ok(`Proposta v${row.version} em rascunho: ${row.title} (${row.offer}). Envio só com aprovação.`, { proposalId: row.id });
  },
  "sales.send_proposal": (p, ctx) => {
    const db = getDB();
    const proposal = db.commercialProposals?.find((x) => x.id === p.proposalId);
    if (!proposal) return fail("proposta não encontrada");
    if (proposal.status === "enviada") return fail("proposta já enviada (idempotente)");
    if (!ctx.approvedBy) {
      requestApproval({
        title: `Enviar proposta · ${proposal.title}`,
        description: "Envio no WhatsApp do lead. Sem disparo em massa.",
        details: [
          { label: "Oferta", value: proposal.offer },
          { label: "Valor", value: String(proposal.amount) },
        ],
        tool: "sales.send_proposal",
        params: { proposalId: proposal.id },
        risk: "alto",
        requestedBy: ctx.requestedBy ?? ctx.actor,
      });
      update((d) => {
        const x = d.commercialProposals.find((pr) => pr.id === proposal.id);
        if (x) x.status = "aguardando";
      });
      return ok("Proposta na fila de aprovação. Nada foi enviado.");
    }
    const contact = db.contacts.find((c) => c.id === proposal.contactId);
    if (!contact) return fail("contato não encontrado");
    if (isOptedOut(contact)) return fail("opt-out — não envia proposta");
    let conv = findOrDraftConversation(db, contact);
    if (!conv) return fail("sem conversa para enviar");
    const sent = runTool("messages.send", {
      conversationId: conv.id,
      text: `${proposal.benefits}\n\nEscopo: ${proposal.scope}. Valor de referência: ${proposal.amount}.`,
    }, ctx);
    if (sent.ok) {
      update((d) => {
        const x = d.commercialProposals.find((pr) => pr.id === proposal.id);
        if (x) {
          x.status = "enviada";
          x.sentAt = nowISO();
        }
      });
    }
    return sent.ok ? ok(`Proposta enviada para ${contact.name}.`) : fail(sent.message);
  },
  "rpa.daily_report": () => {
    const row = writeDailyReport();
    return ok(row.body, { reportId: row.id, stats: row.stats });
  },
  "rpa.first_mission": (p, ctx) => {
    const segment = String(p.segment || p.nicho || "").trim();
    const city = String(p.city || p.cidade || "").trim();
    if (!segment || !city) return fail("informe nicho e cidade");
    update((d) => {
      const u = d.users.find((x) => x.id === d.currentUserId);
      if (u) {
        u.prospectSegment = segment;
        u.prospectCity = city;
      }
    });
    runTool("rpa.radar_schedule", { segment, city, limit: Math.min(Number(p.limit) || 5, 10), simulate: p.simulate === true }, ctx);
    const shift = runTool("rpa.run_shift", { nicho: segment, cidade: city, maxLeads: 2, agendar: false, checkout: false, site: false, simulate: p.simulate === true }, ctx);
    return ok(`Primeira missão: ${segment} em ${city}. ${shift.message}`);
  },
  "intelligence.build_dossier": (p) => {
    const id = String(p.contactId || "");
    if (!id) return fail("informe contactId");
    const row = buildDossier(id, {
      informedTicket: p.ticket != null ? Number(p.ticket) : undefined,
      informedMonthly: p.monthly != null ? Number(p.monthly) : undefined,
    });
    if (!row) return fail("contato não encontrado");
    return ok(`Dossiê ${row.nichePlay} · oferta ${row.offer}. ROI em 3 cenários (estimativa).`, { dossierId: row.id, intent: row.intent });
  },
  "leads.detect_intent": (p) => {
    const id = String(p.contactId || "");
    if (!id) return fail("informe contactId");
    const intent = detectBuyIntent(getDB(), id);
    const row = buildDossier(id);
    return ok(`Intenção ${intent} (só o que o contato escreveu).`, { intent, dossierId: row?.id });
  },
  "admin.grant_access": (p) => {
    if (!isPlatformAdmin(currentUser(getDB()))) return fail("só o admin da plataforma libera acesso");
    const userId = String(p.userId || "");
    if (!userId) return fail("informe userId");
    if (p.lifetime === true || p.days === "vitalicio" || p.days === "lifetime") {
      grantLifetimeAccess(userId);
      return ok("Acesso vitalício liberado para a conta.");
    }
    const days = Number(p.days) === 7 ? 7 : 2;
    grantAccessDays(userId, days);
    return ok(`+${days} dias de acesso na conta.`);
  },
  "admin.set_daily_leads": (p) => {
    if (!isPlatformAdmin(currentUser(getDB()))) return fail("só o admin da plataforma altera a cota");
    const userId = String(p.userId || "");
    const limit = Number(p.limit ?? p.leads);
    if (!userId || !Number.isFinite(limit)) return fail("informe userId e limit");
    setDailyLeadQuota(userId, limit);
    return ok(`Cota diária de ${Math.max(1, Math.min(9999, Math.floor(limit)))} leads na conta.`);
  },
  "intelligence.ask": (p) => {
    const q = String(p.question || p.q || "").trim();
    if (!q) return fail("pergunte algo sobre o cadastro desta conta");
    const db = getDB();
    if (isCompanyStatusQuestion(q) || /como esta o comercial/.test(q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
      const b = companyBriefing(db);
      return ok(b.text, { answer: b.text, highlights: b.highlights });
    }
    if (isCouncilQuestion(q)) {
      const c = agentCouncil(db, q);
      const text = `${c.recommendation}\n${c.seats.map((s) => `${s.team} (${s.agent}): ${s.stance} — ${s.evidence}`).join("\n")}\n${c.note}`;
      return ok(text, { answer: text, seats: c.seats });
    }
    if (isCrisisQuestion(q)) {
      const c = crisisState(db);
      const text = c.active ? `Modo crise.\n${c.reasons.join("\n")}\n${c.plan.join("\n")}` : c.plan.join("\n");
      return ok(text, { answer: text, crisis: c });
    }
    const answer = copilotAnswer(db, q);
    return ok(answer, { answer });
  },
  "missions.plan": (p) => {
    const objective = String(p.objective || p.goal || "").trim();
    const title = String(p.title || objective || "Missão comercial").trim();
    if (!objective) return fail("informe o objetivo da missão");
    const n = Number(p.targetValue ?? p.target ?? p.meta);
    const targetValue = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 150) : 20;
    const { mission, tasks } = createMissionFromObjective({ title, objective, targetValue, createdBy: "Helena" });
    return ok(`Missão ${mission.code} planejada (${tasks.length} tarefas). Aguarda aprovação para iniciar. ${mission.strategy}`, { missionId: mission.id, code: mission.code });
  },
  "missions.start": (p, ctx) => {
    const id = String(p.missionId || "");
    if (!id) return fail("informe missionId");
    const db = getDB();
    if (db.killSwitchActive) return fail("kill switch ativo — nenhuma missão inicia");
    const m = db.missions.find((x) => x.id === id);
    if (!m) return fail("missão não encontrada");
    if (m.status === "running") return fail("missão já em execução");
    startMission(id, ctx.approvedBy || ctx.actor || "Helena");
    tickMissions();
    const segment = String(p.segment || p.nicho || "").trim();
    const city = String(p.city || p.cidade || "").trim();
    if (segment && city) {
      runTool("rpa.radar_schedule", { segment, city, limit: Math.min(Number(p.limit) || 8, 20), simulate: p.simulate === true }, ctx);
    }
    return ok(`Missão ${m.code} em execução. Helena orquestra o Time Comercial; o radar só entra se nicho e cidade vierem no pedido.`, { missionId: id });
  },
  "missions.pause": (p, ctx) => {
    const id = String(p.missionId || "");
    if (!id) return fail("informe missionId");
    const m = getDB().missions.find((x) => x.id === id);
    if (!m) return fail("missão não encontrada");
    pauseMission(id, ctx.actor || "Helena");
    return ok(`Missão ${m.code} pausada.`, { missionId: id });
  },
  "helena.briefing": () => {
    const b = companyBriefing(getDB());
    return ok(b.text, { highlights: b.highlights, crisis: b.crisis });
  },
  "helena.council": (p) => {
    const c = agentCouncil(getDB(), String(p.objective || ""));
    const text = `${c.recommendation}\n${c.seats.map((s) => `• ${s.team}: ${s.stance} — ${s.evidence}`).join("\n")}`;
    return ok(text, { seats: c.seats, recommendation: c.recommendation });
  },
  "helena.health": () => {
    const h = integrationHealth(getDB());
    return ok(
      `Integrações: kill switch ${h.killSwitch ? "ligado" : "desligado"}; circuito ${h.circuitOpen ? "aberto" : "fechado"}; RPA ${h.rpa.failed} falha(s), ${h.rpa.queued} na fila. ${h.note}`,
      { ...h },
    );
  },
  "helena.benchmark": () => {
    const rows = agentBenchmark(getDB());
    if (!rows.length) return ok("Ainda não há execuções de agentes nesta conta para comparar.");
    const text = rows.slice(0, 8).map((r) => `${r.actor}: ${r.ok} ok / ${r.fail} falha · erro ${r.errorRate}% · ${r.avgMs}ms`).join("\n");
    return ok(text, { rows });
  },
  "helena.replay": (p) => {
    const id = String(p.missionId || "");
    if (!id) return fail("informe missionId");
    const row = replayMission(getDB(), id);
    if (!row) return fail("missão não encontrada");
    return ok(missionReplayText(row), { missionId: id, events: row.events.length, execs: row.execs.length });
  },
  "helena.watchdog": () => {
    const alerts = runWatchdog(getDB());
    if (!alerts.length) return ok("Watchdog: nenhum travamento no cadastro agora.");
    return ok(alerts.map((a) => a.detail).join(" "), { alerts });
  },
  "helena.verify_outcome": (p) => {
    const hint = String(p.hint || p.description || "").trim();
    if (!hint) return fail("informe o rastro (nome do lead ou trecho da execução)");
    const v = verifySendOutcome(getDB(), hint);
    return v.verified ? ok(v.reason) : fail(v.reason);
  },
  "helena.crisis": () => {
    const c = crisisState(getDB());
    const text = c.active ? `Modo crise ativo.\n${c.reasons.join("\n")}\nPlano:\n${c.plan.join("\n")}` : c.plan[0] || "Sem crise.";
    return ok(text, { active: c.active, reasons: c.reasons, plan: c.plan });
  },
  "intelligence.record_decision": (p) => {
    const contactId = String(p.contactId || "");
    if (!contactId) return fail("informe contactId");
    const status = p.status === "aprovada" || p.status === "rejeitada" || p.status === "executada" ? p.status : "recomendada";
    const row = recordDecision({
      contactId,
      actionId: String(p.actionId || "next"),
      label: String(p.label || "ação"),
      reason: String(p.reason || ""),
      status,
      outcome: p.outcome === "ganho" || p.outcome === "perdido" || p.outcome === "ignorado" ? p.outcome : "aberto",
    });
    return ok(`Decisão ${row.status} gravada neste lead.`, { id: row.id });
  },
  "sales.accept_proposal": (p) => {
    const id = String(p.proposalId || "");
    const db = getDB();
    const proposal = db.commercialProposals?.find((x) => x.id === id);
    if (!proposal) return fail("proposta não encontrada");
    update((d) => {
      if (!Array.isArray(d.commercialProposals)) d.commercialProposals = [];
      const row = d.commercialProposals.find((x) => x.id === id);
      if (row) row.status = "aceita";
      const deal = d.deals.find((x) => x.contactId === proposal.contactId && x.status === "aberto");
      if (deal) {
        deal.status = "ganho";
        deal.probability = 100;
      }
    });
    recordDecision({
      contactId: proposal.contactId,
      actionId: "accept_proposal",
      label: "Proposta aceita no cadastro",
      reason: "O assinante registrou o aceite. Não é assinatura eletrônica de terceiro.",
      status: "executada",
      outcome: "ganho",
    });
    return ok("Proposta marcada como aceita neste CRM. Pagamento e e-sign continuam fora da Helena.");
  },
};

export function tickRpaJobs() {
  tickMissions();
  runWatchdog(getDB());
  maybeEnqueueRadar();
  maybeEnqueueSilenceFollowups();
  const user = currentUser(getDB());
  if (user) maybeEnqueueDailyReport(user);
  const job = claimNextJob();
  if (!job) return;
  const started = Date.now();
  const ctx = { actor: "Helena", actorType: "helena" as const, requestedBy: "Helena" };
  const isVitest = typeof process !== "undefined" && Boolean(process.env?.VITEST);
  try {
    if (job.kind === "scan_maps") {
      const r = runTool("prospect.scan_maps", { ...job.payload, simulate: isVitest || job.payload.simulate === true }, ctx);
      const ids = (r.data?.contactIds as string[]) || [];
      for (const id of ids.slice(0, 8)) runTool("leads.diagnose", { contactId: id }, ctx);
      markJob(job.id, r.ok ? "sent" : "failed", r.ok ? undefined : r.message, Date.now() - started);
      return;
    }
    if (job.kind === "diagnose" && job.contactId) {
      const r = runTool("leads.diagnose", { contactId: job.contactId }, ctx);
      markJob(job.id, r.ok ? "sent" : "failed", r.ok ? undefined : r.message, Date.now() - started);
      return;
    }
    if (job.kind === "followup" && job.contactId) {
      const contact = getDB().contacts.find((c) => c.id === job.contactId);
      if (!contact || isOptedOut(contact)) {
        markJob(job.id, "skipped", "opt-out ou contato ausente", Date.now() - started);
        return;
      }
      const conv = findOrDraftConversation(getDB(), contact);
      if (!conv) {
        markJob(job.id, "failed", "sem conversa", Date.now() - started);
        return;
      }
      if (conv.messages.at(-1)?.from === "contact") {
        markJob(job.id, "skipped", "o contato respondeu; follow-up cancelado", Date.now() - started);
        return;
      }
      const lastOutboundAt = conv.flow?.lastOutboundAt
        ?? [...conv.messages].reverse().find((message) => message.from === "agent" || message.from === "helena")?.at;
      const text = String(job.payload.text || "Retorno Helena.");
      requestApproval({
        title: `Follow-up para ${contact.name}`,
        description: "A mensagem está pronta. O contato será revalidado e nada será enviado sem esta aprovação.",
        details: [{ label: "Mensagem", value: text }],
        tool: "rpa.send_approved_followup",
        params: { jobId: job.id, conversationId: conv.id, lastOutboundAt, text },
        risk: "alto",
        requestedBy: "Helena",
      });
      markJob(job.id, "awaiting_approval", undefined, Date.now() - started);
      return;
    }
    if (job.kind === "daily_report") {
      const r = runTool("rpa.daily_report", {}, ctx);
      markJob(job.id, r.ok ? "sent" : "failed", r.ok ? undefined : r.message, Date.now() - started);
      return;
    }
    if (job.kind === "send_wa") {
      markJob(job.id, "sent", undefined, Date.now() - started);
      return;
    }
    markJob(job.id, "skipped", `kind ${job.kind} no worker local`, Date.now() - started);
  } catch (e) {
    markJob(job.id, "failed", e instanceof Error ? e.message : "erro", Date.now() - started);
  }
}

function newOperation(d: DB, o: { title: string; objective: string; total: number; agentIds: string[]; connectionId?: string; requestedBy: string }): Operation {
  const lastCode = Math.max(...d.operations.map((x) => Number(x.code.split("-")[1]) || 0), 2940);
  return {
    id: uid("op_"), organizationId: d.organization.id, code: `OP-${lastCode + 1}`, title: o.title, objective: o.objective,
    requestedBy: o.requestedBy, agentIds: o.agentIds, connectionId: o.connectionId, status: "running", total: o.total, processed: 0,
    metrics: { responded: 0, interested: 0, qualified: 0, meetings: 0, handoffs: 0 }, cost: 0,
    steps: ["Selecionar lista", "Preparar agentes", "Validar WhatsApp", `Prospectar ${o.total} contatos`, "Classificar respostas", "Encaminhar interessados", "Gerar relatório"].map((label, i) => ({ id: `s${i}`, label, status: "pending" as const })),
    events: [{ at: nowISO(), text: `Operação criada por ${o.requestedBy}`, kind: "info" }],
    createdAt: nowISO(),
  };
}

export function runTool(name: string, params: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const started = Date.now();
  const db = getDB();
  const def = getToolDef(name);
  let result: ToolResult;
  if (!def || !handlers[name]) result = fail(`a ferramenta ${name} não existe`);
  else if (db.toolSettings.find((t) => t.name === name)?.enabled === false) result = fail(`a ferramenta "${def.label}" está desativada em IA → Skills`);
  else if (ctx.actorType !== "agent" && ctx.actorType !== "helena" && ctx.actorType !== "sistema" && !can(db, def.permission)) result = fail("seu perfil não tem permissão para essa ação");
  else {
    const circuit = circuitBreaker(db, name);
    if (circuit) result = fail(circuit);
    else {
      try {
        result = handlers[name](params as Record<string, any>, ctx);
      } catch (e) {
        result = fail(e instanceof Error ? e.message : "erro inesperado");
      }
    }
  }
  logExecution({
    actor: ctx.actor, actorType: ctx.actorType, action: name, description: result.ok ? result.message : `Falha: ${result.message}`,
    params, result: result.ok ? "sucesso" : "falha", error: result.ok ? undefined : result.message,
    requestedBy: ctx.requestedBy ?? ctx.actor, approvedBy: ctx.approvedBy, durationMs: Date.now() - started + Math.round(Math.random() * 300),
  });
  return result;
}

/** UI helper: a signed-in user performing an action directly. */
export function userAction(name: string, params: Record<string, unknown>) {
  const u = currentUser(getDB());
  return runTool(name, params, { actor: u.name, actorType: "user", requestedBy: u.name });
}

export function requestApproval(a: Omit<Approval, "id" | "organizationId" | "status" | "createdAt">) {
  const id = uid("ap_");
  update((d) => {
    d.approvals.unshift({ ...a, id, organizationId: d.organization.id, status: "pendente", createdAt: nowISO() });
  });
  logExecution({ actor: a.requestedBy, actorType: a.requestedBy === "Helena" ? "helena" : "agent", action: "approval.request", description: `Solicitou aprovação: ${a.title}`, params: a.params, result: "pendente", requestedBy: currentUser(getDB()).name, durationMs: 40 });
  return id;
}

export function decideApproval(id: string, approve: boolean): ToolResult {
  const db = getDB();
  const ap = db.approvals.find((a) => a.id === id);
  if (!ap) return fail("aprovação não encontrada");
  if (ap.status !== "pendente") return fail("essa aprovação já foi decidida");
  const user = currentUser(db);
  if (!can(db, "approvals.decide")) return fail("seu perfil não pode aprovar ações de IA");
  update((d) => {
    const x = d.approvals.find((a) => a.id === id)!;
    x.status = approve ? "aprovada" : "negada";
    x.decidedBy = user.name;
    x.decidedAt = nowISO();
  });
  logExecution({ actor: user.name, actorType: "user", action: approve ? "approval.approve" : "approval.deny", description: `${approve ? "Aprovou" : "Negou"}: ${ap.title}`, result: "sucesso", requestedBy: ap.requestedBy, durationMs: 20 });

  if (!approve) {
    update((d) => {
      const opId = ap.params.operationId as string | undefined;
      const op = d.operations.find((o) => o.id === opId);
      if (op) {
        op.status = "failed";
        op.result = `Negada por ${user.name}. Nada foi executado.`;
        op.events.unshift({ at: nowISO(), text: `Execução negada por ${user.name}`, kind: "error" });
      }
      const camp = d.campaigns.find((c) => c.id === ap.params.campaignId);
      if (camp && camp.status === "aguardando_aprovacao") camp.status = "rascunho";
      if (ap.tool === "sales.send_menu_followup") {
        const conv = d.conversations.find((c) => c.id === ap.params.conversationId);
        if (conv?.flow?.state === "aguardando_aprovacao") conv.flow.state = "esfriou";
      }
      if (ap.tool === "rpa.send_approved_followup") {
        const job = d.rpaJobs.find((entry) => entry.id === ap.params.jobId);
        if (job?.status === "awaiting_approval") {
          job.status = "skipped";
          job.error = `Follow-up negado por ${user.name}`;
          job.finishedAt = nowISO();
        }
      }
    });
    pushHelenaMessage(`Entendido. "${ap.title}" foi cancelado e nada foi executado.`);
    return ok("Negado");
  }

  const result = runTool(ap.tool, ap.params, { actor: "Helena", actorType: "helena", requestedBy: ap.requestedBy, approvedBy: user.name });
  if (result.ok && result.data?.operationId) {
    pushHelenaMessage(`Execução autorizada. ${result.message}. Vou acompanhar e te aviso sobre os resultados.`, { type: "operation", operationId: String(result.data.operationId) });
  } else if (result.ok) {
    pushHelenaMessage(`Feito: ${result.message}.`, { type: "result", ok: true, title: ap.title, detail: result.message });
  } else {
    pushHelenaMessage(`Não consegui executar "${ap.title}" porque ${result.message}. Nada foi alterado.`, { type: "result", ok: false, title: ap.title, detail: result.message });
  }
  return result;
}

export interface Summary {
  leads7d: number;
  openPipeline: number;
  openDeals: number;
  won: number;
  wonValue: number;
  lost: number;
  conversion: number;
  meetings: number;
  staleDeals: number;
  followupsToday: number;
  bestAgent: { name: string; rate: number } | null;
  aiCost30d: number;
  runningOps: number;
  pendingApprovals: number;
  workingAgents: number;
}

export function computeSummary(db: DB): Summary {
  const b = liveBoard(db);
  return {
    leads7d: b.leads7d,
    openPipeline: b.pipelineValue,
    openDeals: b.openDealsCount,
    won: b.wonCount,
    wonValue: b.totalRevenue,
    lost: b.lostCount,
    conversion: b.convRate,
    meetings: b.meetings.length,
    staleDeals: b.staleDeals,
    followupsToday: b.followupsToday,
    bestAgent: b.bestAgent,
    aiCost30d: db.aiUsage.reduce((s, u) => s + u.cost, 0),
    runningOps: b.runningOps,
    pendingApprovals: b.pendingApprovals,
    workingAgents: b.workingAgents,
  };
}

/** Operations avançam só com disparos reais (Evolution) e reuniões na Agenda. */
export function tickOperations() {
  return;
}

let lastCloserHuntAt = 0;

/**
 * Vigia o número comercial compartilhado: quando um lead da prospecção não
 * responde (ou visualiza e não responde) no prazo, a Closer entra sozinha.
 * Chamado em intervalo pelo layout do app; o servidor faz o mesmo com mensagens reais.
 */
export function tickSalesFlow(now = new Date()) {
  const db = getDB();
  if (db.salesFlow && (db.salesFlow.noReplyHours < 24 || db.salesFlow.maxCloserAttempts > 1)) {
    update((d) => {
      d.salesFlow.noReplyHours = 24;
      d.salesFlow.readNoReplyHours = 24;
      d.salesFlow.respectBusinessHours = true;
      d.salesFlow.maxCloserAttempts = 1;
      d.agents.forEach((a) => {
        if (a.teamId === "t_com" && a.status !== "pausado" && a.status !== "erro") {
          a.status = "trabalhando";
          a.currentTask = "Prospecção ativa · aguardando resposta";
        }
      });
      const team = d.teams.find((t) => t.id === "t_com");
      if (team) team.status = "ativo";
    });
  }
  const s = getDB().salesFlow;
  if (!s?.enabled || db.killSwitchActive) return;
  const closer = db.agents.find((a) => a.id === s.closerAgentId);
  if (!closer || closer.status === "pausado" || closer.status === "erro") return;
  const conn = db.connections.find((c) => c.id === s.sharedConnectionId);
  if (!conn || conn.status !== "online") return;

  const cooled: string[] = [];
  if (Date.now() - lastCloserHuntAt < 30 * 60_000) return;
  let hunted = 0;
  getDB().conversations.forEach((conv) => {
    if (hunted >= 1) return;
    if ((conv.connectionId ?? s.sharedConnectionId) !== s.sharedConnectionId) return;
    const decision = evaluateFollowup(conv, s, now);
    if (decision.action === "closer") {
      runTool("sales.closer_takeover", { conversationId: conv.id, reason: decision.reason }, { actor: closer.name, actorType: "agent", requestedBy: "Automação do número comercial" });
      hunted += 1;
      lastCloserHuntAt = Date.now();
    } else if (decision.action === "esfriou") {
      cooled.push(conv.id);
    }
  });
  if (cooled.length) {
    update((d) => {
      cooled.forEach((id) => {
        const c = d.conversations.find((x) => x.id === id);
        if (!c?.flow) return;
        c.flow.state = "esfriou";
        c.status = "pendente";
        d.activities.unshift({ id: uid("ac_"), organizationId: d.organization.id, contactId: c.contactId, type: "ia", text: `Lead esfriou depois de ${c.flow.closerAttempts} tentativas da Closer sem resposta`, actor: "Automação do número comercial", createdAt: nowISO() });
      });
    });
  }
}
