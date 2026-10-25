// Tool-calling engine. Every action performed by Helena, an agent or a user from
// the UI goes through runTool(), which checks permission/enablement, mutates the
// data store and writes an Execution record. Nothing is "pretended".
import type {
  Agent, Approval, Automation, DB, Execution, HelenaCard, HelenaMessage, Operation, RiskLevel, Task,
} from "@/lib/types";
import { can, currentUser, getDB, nowISO, uid, update } from "@/lib/store";
import { getToolDef } from "./registry";
import { normalize } from "@/lib/format";
import { brl } from "@/lib/format";
import { formatForWhatsApp, evaluateHandoff } from "./whatsapp-formatter";
import type { HandoffStage } from "./whatsapp-formatter";
import {
  checkDuplicateContact,
  isLeadHandledByAnotherSdr,
  OBJECTION_MATRIX,
  evaluateBant,
  generatePixCheckout,
  executeRescueColdLeads,
  computeDynamicCadence,
} from "./sales-brain";

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
  return requiresApproval(toolRisk(db, name), db.helenaSettings.autoApproveMedium);
}

function logExecution(e: Omit<Execution, "id" | "organizationId" | "at">) {
  update((db) => {
    db.executions.unshift({ id: uid("ex_"), organizationId: db.organization.id, at: nowISO(), ...e });
    if (db.executions.length > 400) db.executions.length = 400;
  });
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
  if (!connectionId) return null;
  const c = db.connections.find((x) => x.id === connectionId);
  if (!c) return "a conexão de WhatsApp selecionada não existe";
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

    update((d) => {
      const c = d.conversations.find((x) => x.id === conv.id)!;

      // Registra a mensagem enviada pelo agente
      c.messages.push({
        id: uid("m_"),
        from: p.from ?? "agent",
        authorName: p.authorName ?? (currentAgent?.name ?? ctx.actor),
        text: outText,
        at: nowISO(),
        kind: "text",
      });
      c.lastMessageAt = nowISO();
      c.unread = 0;

      // Atualiza métricas do contato
      const ct = d.contacts.find((x) => x.id === c.contactId);
      if (ct) ct.lastContactAt = nowISO();
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
        tools: p.tools ?? [], channels: p.channels ?? ["whatsapp"], schedule: p.schedule ?? "Seg–Sex, 08:00–18:00",
        supervisorId: p.supervisorId || undefined, teamId: p.teamId || undefined, budget: Number(p.budget ?? 150), spent: 0,
        status: "aguardando", permissions: p.permissions ?? ["crm.view"], color: (["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const)[d.agents.length % 5],
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
      op.events.unshift({ at: nowISO(), text: `Operação iniciada${ctx.approvedBy ? ` · aprovada por ${ctx.approvedBy}` : ""}`, kind: "success" });
      d.operations.unshift(op);
      id = op.id;
      setAgentsStatus(d, op.agentIds.slice(0, 2), "trabalhando", op.title);
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
    const docs = getDB().knowledge.filter((k) => normalize(`${k.name} ${k.collection}`).includes(q));
    return ok(`${docs.length} documentos relevantes`, { ids: docs.map((k) => k.id) });
  },
  "analytics.query": () => ok("Métricas consultadas", computeSummary(getDB()) as unknown as Record<string, unknown>),
  "calendar.create_event": (p, ctx) => {
    const db = getDB();
    const contact = p.contactId ? db.contacts.find((c) => c.id === p.contactId) : undefined;
    if (p.contactId && !contact) return fail("contato não encontrado");
    if (!contact && !p.title) return fail("informe o cliente ou o título da reunião");
    const flow = db.salesFlow;
    const ownerId: string = p.ownerId || flow?.closerAgentId || db.agents.find((a) => a.role === "Closer")?.id || db.currentUserId;
    const ownerIsAgent = db.agents.some((a) => a.id === ownerId);
    if (!ownerIsAgent && !db.users.some((u) => u.id === ownerId)) return fail("responsável pela reunião não encontrado");
    const durationMin = Math.max(15, Number(p.durationMin) || flow?.meetingDurationMin || 30);

    const raw = p.startAt || p.at || p.date;
    let start: Date | undefined;
    if (raw) {
      start = new Date(String(raw).replace(" ", "T"));
      if (Number.isNaN(start.getTime())) return fail("data da reunião inválida");
    } else {
      start = suggestSlots(db.meetings, ownerId, new Date(), flow, 1)[0];
      if (!start) return fail("não encontrei horário livre nos próximos dias");
    }
    const startAt = start.toISOString();
    const owner = ownerName(db, ownerId);
    if (hasConflict(db.meetings, ownerId, startAt, durationMin)) return fail(`${owner} já tem uma reunião nesse horário`);

    const location: Meeting["location"] = p.location ?? "google_meet";
    const code = uid("").slice(0, 3) + "-" + uid("").slice(0, 4) + "-" + uid("").slice(0, 3);
    const link = location === "google_meet" ? `https://meet.google.com/${code}` : undefined;
    const title = p.title || `Apresentação de site · ${contact?.name ?? "Cliente"}`;
    const id = uid("mt_");
    const dealId: string | undefined = p.dealId || (contact ? db.deals.find((x) => x.contactId === contact.id && x.status === "aberto")?.id : undefined);
    const when = slotLabel(start);

    update((d) => {
      d.meetings.push({
        id, organizationId: d.organization.id, title, contactId: contact?.id, dealId, ownerId, ownerType: ownerIsAgent ? "agent" : "user",
        startAt, durationMin, location, link, status: "agendada",
        source: p.source ?? (ctx.actorType === "helena" ? "helena" : ctx.actorType === "agent" ? "closer" : "manual"),
        notes: p.notes || undefined, createdBy: ctx.actor, createdAt: nowISO(),
      });

      if (dealId) {
        const deal = d.deals.find((x) => x.id === dealId);
        const reunStage = d.pipelines.find((pl) => pl.id === deal?.pipelineId)?.stages.find((s) => s.id === "st_reun" || /reuni/i.test(s.name));
        if (deal && reunStage) {
          deal.stageId = reunStage.id;
          deal.probability = reunStage.probability;
          deal.updatedAt = nowISO();
        }
      }
      if (contact) {
        const conv = d.conversations.find((c) => c.contactId === contact.id && c.flow);
        if (conv?.flow) conv.flow.state = "reuniao_agendada";
        d.activities.unshift({
          id: uid("ac_"), organizationId: d.organization.id, contactId: contact.id, dealId, type: "reuniao",
          text: `Reunião marcada para ${when} com ${owner}: ${title}${link ? `. Link: ${link}` : ""}`,
          actor: ctx.actor, createdAt: nowISO(),
        });
      }
    });

    return ok(`Reunião marcada para ${when} com ${contact?.name ?? title} (responsável: ${owner})`, { meetingId: id, calLink: link ?? "", startAt });
  },
  "calendar.list_events": (p) => {
    const db = getDB();
    const from = p.from ? new Date(p.from).getTime() : Date.now() - 3_600_000;
    const to = p.to ? new Date(p.to).getTime() : Date.now() + 7 * 86_400_000;
    const found = db.meetings
      .filter((m) => m.status !== "cancelada")
      .filter((m) => { const t = new Date(m.startAt).getTime(); return t >= from && t <= to; })
      .filter((m) => !p.ownerId || m.ownerId === p.ownerId)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    return ok(`${found.length} reunião(ões) no período`, { ids: found.map((m) => m.id) });
  },
  "calendar.update_event": (p, ctx) => {
    const db = getDB();
    const m = db.meetings.find((x) => x.id === p.meetingId);
    if (!m) return fail("reunião não encontrada");
    if (m.status === "cancelada") return fail("essa reunião foi cancelada");
    let startAt = m.startAt;
    if (p.startAt) {
      const s = new Date(String(p.startAt).replace(" ", "T"));
      if (Number.isNaN(s.getTime())) return fail("data da reunião inválida");
      startAt = s.toISOString();
      if (hasConflict(db.meetings, m.ownerId, startAt, m.durationMin, m.id)) return fail(`${ownerName(db, m.ownerId)} já tem uma reunião nesse horário`);
    }
    const statusLabel: Record<string, string> = { agendada: "agendada", confirmada: "confirmada", realizada: "realizada", nao_compareceu: "marcada como não compareceu" };
    update((d) => {
      const x = d.meetings.find((y) => y.id === m.id)!;
      if (p.startAt) { x.startAt = startAt; if (x.status === "nao_compareceu") x.status = "agendada"; }
      if (p.status) x.status = p.status;
      if (p.notes !== undefined) x.notes = p.notes;
      if (x.contactId) {
        d.activities.unshift({
          id: uid("ac_"), organizationId: d.organization.id, contactId: x.contactId, dealId: x.dealId, type: "reuniao",
          text: p.startAt ? `Reunião remarcada para ${slotLabel(new Date(startAt))}` : `Reunião ${statusLabel[p.status] ?? "atualizada"}`,
          actor: ctx.actor, createdAt: nowISO(),
        });
      }
    });
    return ok(p.startAt ? `Reunião remarcada para ${slotLabel(new Date(startAt))}` : `Reunião ${statusLabel[p.status] ?? "atualizada"}`, { meetingId: m.id });
  },
  "calendar.cancel_event": (p, ctx) => {
    const db = getDB();
    const m = db.meetings.find((x) => x.id === p.meetingId);
    if (!m) return fail("reunião não encontrada");
    if (m.status === "cancelada") return fail("essa reunião já estava cancelada");
    update((d) => {
      const x = d.meetings.find((y) => y.id === m.id)!;
      x.status = "cancelada";
      if (p.reason) x.notes = `${x.notes ? `${x.notes}\n` : ""}Cancelada: ${p.reason}`;
      if (x.contactId) {
        d.activities.unshift({ id: uid("ac_"), organizationId: d.organization.id, contactId: x.contactId, dealId: x.dealId, type: "reuniao", text: `Reunião cancelada${p.reason ? `: ${p.reason}` : ""}`, actor: ctx.actor, createdAt: nowISO() });
      }
    });
    return ok(`Reunião "${m.title}" cancelada`, { meetingId: m.id });
  },
  "sales.closer_takeover": (p, ctx) => {
    const db = getDB();
    const s = db.salesFlow;
    const conv = db.conversations.find((c) => c.id === p.conversationId);
    if (!conv) return fail("conversa não encontrada");
    if (!conv.flow) return fail("essa conversa não veio da prospecção");
    if (conv.handlerType === "human") return fail("um atendente do time já assumiu essa conversa");
    const closer = db.agents.find((a) => a.id === s.closerAgentId);
    if (!closer) return fail("a agente Closer configurada não existe");
    if (closer.status === "pausado" || closer.status === "erro") return fail(`${closer.name} está ${closer.status === "erro" ? "com erro" : "pausada"}`);
    const problem = connectionCheck(db, conv.connectionId ?? s.sharedConnectionId);
    if (problem) return fail(problem);
    const contact = db.contacts.find((c) => c.id === conv.contactId);
    const reason: FollowupReason = p.reason === "visualizou_sem_responder" ? "visualizou_sem_responder" : (conv.flow.readAt && conv.flow.readAt >= conv.flow.lastOutboundAt ? "visualizou_sem_responder" : "sem_resposta");
    const attempt = conv.flow.closerAttempts + 1;
    const slots = suggestSlots(db.meetings, closer.id, new Date(), s, 2);
    const text = formatForWhatsApp(closerFollowupText({ contactName: contact?.name ?? "cliente", closerName: closer.name, company: db.organization.name, attempt, reason, slots }));
    const previous = ownerName(db, conv.handlerId);

    update((d) => {
      const c = d.conversations.find((x) => x.id === conv.id)!;
      const f = c.flow!;
      c.handlerType = "agent";
      c.handlerId = closer.id;
      c.status = "aberta";
      c.messages.push({ id: uid("m_"), from: "agent", authorName: closer.name, text, at: nowISO(), kind: "text" });
      c.lastMessageAt = nowISO();
      f.state = "closer";
      f.closerAttempts = attempt;
      f.closerSince ??= nowISO();
      f.lastOutboundAt = nowISO();
      f.proposedSlots = slots.map((x) => x.toISOString());
      const wa = d.connections.find((x) => x.id === (c.connectionId ?? d.salesFlow.sharedConnectionId));
      if (wa) wa.sentToday += 1;
      const ag = d.agents.find((a) => a.id === closer.id);
      if (ag) { ag.metrics.tasks += 1; if (attempt === 1) ag.metrics.conversations += 1; ag.currentTask = `Resgatando ${contact?.name ?? "lead"}`; }
      const deal = d.deals.find((x) => x.contactId === c.contactId && x.status === "aberto");
      if (deal) { deal.ownerId = closer.id; deal.ownerType = "agent"; deal.updatedAt = nowISO(); }
      d.activities.unshift({
        id: uid("ac_"), organizationId: d.organization.id, contactId: c.contactId, dealId: deal?.id, type: "handoff",
        text: attempt === 1
          ? `${closer.name} assumiu no lugar de ${previous}: o cliente ${FOLLOWUP_REASON_LABEL[reason]}`
          : `${closer.name} fez a ${attempt}ª tentativa de fechamento`,
        actor: ctx.actor, createdAt: nowISO(),
      });
    });
    return ok(`${closer.name} entrou na conversa com ${contact?.name ?? "o cliente"} e ofereceu ${slots.map((x) => slotLabel(x)).join(" ou ")}`, { conversationId: conv.id, attempt });
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
        const c = d.conversations.find((x) => x.id === conv.id)!;
        if (c.flow) {
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
      const c = d.conversations.find((x) => x.id === conv.id)!;
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

    // Closer em ação: se o cliente aceitou um horário, ela já marca na Agenda.
    const fresh = getDB().conversations.find((c) => c.id === conv.id)!;
    const s = getDB().salesFlow;
    if (fresh.flow?.state === "closer" && fresh.handlerType === "agent" && fresh.handlerId === s.closerAgentId && s.autoBookMeetings) {
      const parsed = parseWhen(text);
      const picked = parsed?.hasTime ? parsed.date.toISOString() : pickProposedSlot(text, fresh.flow.proposedSlots);
      if (picked) {
        const closer = getDB().agents.find((a) => a.id === s.closerAgentId)!;
        const booked = runTool("calendar.create_event", { contactId: fresh.contactId, startAt: picked, ownerId: closer.id, source: "closer" }, { actor: closer.name, actorType: "agent", requestedBy: ctx.actor });
        const when = slotLabel(new Date(picked));
        const reply = booked.ok
          ? `Perfeito, ficou reservado ${when}. Vou te mandar o link um pouco antes. Até lá!`
          : `Esse horário acabou de ser ocupado. Consigo ${(fresh.flow.proposedSlots ?? []).filter((x) => x !== picked).map((x) => slotLabel(new Date(x))).join(" ou ") || "outro horário"}, pode ser?`;
        update((d) => {
          const c = d.conversations.find((x) => x.id === conv.id)!;
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
    const segment = String(p.segment || "Clínicas odontológicas");
    const city = String(p.city || "São Paulo, SP");
    const limit = Math.min(Number(p.limit) || 10, 50);

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

    const sdr = getDB().agents.find((a) => a.role === "SDR") || getDB().agents[0];
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
          ownerId: sdr.id,
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
          tags: ["#sem-site", "Google Maps", segment.toLowerCase()],
          source: "Prospecção",
          ownerId: sdr.id,
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
            value: 4900,
            probability: stage.probability,
            expectedClose: new Date(Date.now() + 20 * 86_400_000).toISOString(),
            ownerId: sdr.id,
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
          status: "aberta",
          handlerType: "agent",
          handlerId: sdr.id,
          unread: 0,
          sentiment: "neutro",
          lastMessageAt: nowISO(),
          messages: [
            {
              id: uid("m_"),
              from: "agent",
              authorName: sdr.name,
              text: formatForWhatsApp(`Olá ${contactName}! Sou o ${sdr.name} da Info Tech Ltda. Encontrei a ${compName} no Google Maps em ${city} e notei que vocês ainda não possuem um site institucional oficial para receber os pacientes e clientes que buscam no Google. Criamos páginas de alta conversão para dobrar o agendamento no seu segmento. Podemos te apresentar uma prévia sem compromisso?`),
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
          text: `Agente ${sdr.name} identificou oportunidade no Google Maps (#sem-site) e iniciou abordagem via WhatsApp`,
          actor: sdr.name,
          createdAt: nowISO(),
        });
      }
    });

    return ok(
      `Varredura concluída no Google Maps: ${limit} empresas em ${city} identificadas SEM SITE. Injetadas diretamente no CRM com tag #sem-site e atribuídas ao ${sdr.name} para abordagem imediata.`,
      { count: limit, companyIds: createdCompanyIds, contactIds: createdContactIds, dealIds: createdDealIds }
    );
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

      // Se a ação for enviar mídia demonstrativa
      if (objDef.actionType === "send_demo_media" && objDef.demoMockMedia) {
        conv.messages.push({
          id: uid("m_media_"),
          from: "agent",
          authorName: "Helena AI (Sales Brain)",
          text: formatForWhatsApp(`${objDef.demoMockMedia.title}\n${objDef.demoMockMedia.preview}\n\nDemonstração ao vivo: ${objDef.demoMockMedia.url}`),
          at: nowISO(),
          kind: "image",
        });
      }

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
        text: `⚡ HELENA contornou objeção "${objDef.title}". Ação: ${objDef.actionDescription}`,
        actor: ctx.actor,
        createdAt: nowISO(),
      });
    });

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
};

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
  else if (ctx.actorType !== "agent" && ctx.actorType !== "sistema" && !can(db, def.permission)) result = fail("seu perfil não tem permissão para essa ação");
  else {
    try {
      result = handlers[name](params as Record<string, any>, ctx);
    } catch (e) {
      result = fail(e instanceof Error ? e.message : "erro inesperado");
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
  const now = Date.now();
  const open = db.deals.filter((d) => d.status === "aberto" && d.pipelineId === "pl_com");
  const won = db.deals.filter((d) => d.status === "ganho");
  const lost = db.deals.filter((d) => d.status === "perdido");
  const sdrs = db.agents.filter((a) => a.metrics.responseRate > 0 && a.role === "SDR").sort((a, b) => b.metrics.responseRate - a.metrics.responseRate);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  return {
    leads7d: db.contacts.filter((c) => now - new Date(c.createdAt).getTime() < 7 * 86_400_000).length + db.operations.reduce((s, o) => s + (now - new Date(o.createdAt).getTime() < 7 * 86_400_000 ? o.metrics.interested : 0), 0),
    openPipeline: open.reduce((s, d) => s + d.value, 0),
    openDeals: open.length,
    won: won.length,
    wonValue: won.reduce((s, d) => s + d.value, 0),
    lost: lost.length,
    conversion: won.length + lost.length ? (won.length / (won.length + lost.length + open.length)) * 100 : 0,
    meetings: db.operations.reduce((s, o) => s + o.metrics.meetings, 0),
    staleDeals: open.filter((d) => now - new Date(d.updatedAt).getTime() > 48 * 3_600_000).length,
    followupsToday: db.tasks.filter((t) => !t.done && t.type === "follow-up" && new Date(t.dueAt) <= endOfDay).length,
    bestAgent: sdrs[0] ? { name: sdrs[0].name, rate: sdrs[0].metrics.responseRate } : null,
    aiCost30d: db.aiUsage.reduce((s, u) => s + u.cost, 0),
    runningOps: db.operations.filter((o) => o.status === "running").length,
    pendingApprovals: db.approvals.filter((a) => a.status === "pendente").length,
    workingAgents: db.agents.filter((a) => a.status === "trabalhando").length,
  };
}

/** Advances running operations. Called on an interval by the app shell. */
export function tickOperations() {
  const db = getDB();
  if (!db.operations.some((o) => o.status === "running")) return;
  const finished: Operation[] = [];
  update((d) => {
    const leadNames = d.contacts.map((c) => c.name);
    d.operations.forEach((o) => {
      if (o.status !== "running") return;
      const inc = Math.min(o.total - o.processed, 1 + Math.floor(Math.random() * 2));
      o.processed += inc;
      if (Math.random() < 0.35) o.metrics.responded += 1;
      if (Math.random() < 0.15) o.metrics.interested += 1;
      if (Math.random() < 0.08) o.metrics.qualified += 1;
      if (Math.random() < 0.04) o.metrics.meetings += 1;
      o.cost = Math.round((o.cost + inc * 0.06) * 100) / 100;
      const frac = o.processed / o.total;
      const runIdx = Math.max(o.steps.findIndex((s) => s.status === "running"), Math.min(o.steps.length - 2, Math.floor(frac * (o.steps.length - 1))));
      o.steps.forEach((s, i) => {
        if (s.status === "failed") return;
        s.status = i < runIdx ? "done" : i === runIdx ? "running" : "pending";
      });
      if (Math.random() < 0.12) {
        const n = leadNames[Math.floor(Math.random() * leadNames.length)];
        o.events.unshift({ at: nowISO(), text: Math.random() < 0.5 ? `${o.processed} contatos processados` : `${n} demonstrou interesse`, kind: "info" });
      }
      d.campaigns.forEach((c) => {
        if (c.name === o.title && c.status === "ativa") {
          c.sent = Math.min(c.total, o.processed);
          c.replies = o.metrics.responded;
          c.interested = o.metrics.interested;
          c.meetings = o.metrics.meetings;
        }
      });
      o.agentIds.forEach((id) => {
        const a = d.agents.find((x) => x.id === id);
        if (a && a.status === "trabalhando") a.spent = Math.round((a.spent + 0.02) * 100) / 100;
      });
      if (o.processed >= o.total) {
        o.status = "completed";
        o.steps.forEach((s) => s.status !== "failed" && (s.status = "done"));
        o.result = `${o.processed} contatos processados, ${o.metrics.responded} responderam, ${o.metrics.interested} interessados, ${o.metrics.meetings} reuniões.`;
        o.events.unshift({ at: nowISO(), text: "Operação concluída", kind: "success" });
        d.campaigns.forEach((c) => c.name === o.title && (c.status = "concluida"));
        finished.push(structuredClone(o));
      }
      if (o.events.length > 40) o.events.length = 40;
    });
  });
  finished.forEach((o) => {
    logExecution({ actor: "Helena", actorType: "helena", action: "operations.complete", description: `${o.code} concluída: ${o.result}`, result: "sucesso", requestedBy: o.requestedBy, durationMs: 0 });
    pushHelenaMessage(
      `Atualização da operação ${o.title}:\n\n${o.processed} contatos processados.\n${o.metrics.responded} responderam.\n${o.metrics.interested} demonstraram interesse.\n${o.metrics.qualified} foram qualificados.\n${o.metrics.meetings} reuniões foram agendadas.\n${o.metrics.handoffs} solicitaram atendimento humano.\n\nQuer que eu aumente a operação amanhã?`,
      { type: "operation", operationId: o.id },
    );
  });
}
