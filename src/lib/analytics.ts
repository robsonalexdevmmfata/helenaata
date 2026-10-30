import type { Agent, DB, Operation } from "@/lib/types";

const OPEN_FUNNEL_STAGES = ["st_novo", "st_qual", "st_reun", "st_prop", "st_neg"];

export interface LiveAgentStats {
  id: string;
  name: string;
  role: string;
  conversations: number;
  meetings: number;
  conversions: number;
  outbound: number;
}

export function liveAgentStats(db: DB): LiveAgentStats[] {
  return db.agents.map((a) => agentStats(db, a));
}

export function agentStats(db: DB, agent: Agent): LiveAgentStats {
  const conversations = db.conversations.filter((c) => c.handlerId === agent.id).length;
  const meetings = (db.calendarEvents ?? []).filter(
    (e) => e.agenteId === agent.id && e.status !== "cancelada",
  ).length;
  const conversions = db.deals.filter((d) => d.status === "ganho" && d.ownerId === agent.id).length;
  const outbound = db.executions.filter(
    (e) => e.actor === agent.name && e.action.includes("evolution.sendText") && e.result === "sucesso",
  ).length;
  return { id: agent.id, name: agent.name, role: agent.role, conversations, meetings, conversions, outbound };
}

export function computeAnalytics(db: DB) {
  const wonDeals = db.deals.filter((d) => d.status === "ganho");
  const lostDeals = db.deals.filter((d) => d.status === "perdido");
  const openDeals = db.deals.filter((d) => d.status === "aberto" && d.pipelineId === "pl_com");
  const pipelineDeals = openDeals.filter((d) => OPEN_FUNNEL_STAGES.includes(d.stageId));

  const totalRevenue = wonDeals.reduce((s, d) => s + d.value, 0);
  const pipelineValue = pipelineDeals.reduce((s, d) => s + d.value, 0);
  const totalLeads = db.contacts.length;
  const convRate = totalLeads > 0 ? Math.round((wonDeals.length / totalLeads) * 1000) / 10 : 0;

  const totalConversations = db.conversations.length;
  const resolvedConvs = db.conversations.filter((c) => c.status === "resolvida").length;
  const csat = totalConversations > 0 ? Math.round((resolvedConvs / totalConversations) * 100) : 0;

  const evoSends = db.executions.filter(
    (e) => e.action.includes("evolution.sendText") && e.result === "sucesso",
  ).length;
  const campaignSent = Math.max(
    evoSends,
    db.campaigns.reduce((s, c) => s + c.sent, 0),
    db.connections.reduce((s, c) => s + c.sentToday, 0),
  );
  const meetings = (db.calendarEvents ?? []).filter((e) => e.status !== "cancelada").length;
  const campaignConv = campaignSent > 0 ? ((meetings / campaignSent) * 100).toFixed(1) : "0";

  const pipeline = db.pipelines.find((p) => p.id === "pl_com") ?? db.pipelines[0];
  const dealsByStage = (pipeline?.stages ?? []).map((stage) => {
    const stageDeals =
      stage.id === "st_ganho"
        ? wonDeals
        : openDeals.filter((d) => d.stageId === stage.id);
    return {
      stage,
      count: stageDeals.length,
      value: stageDeals.reduce((s, d) => s + d.value, 0),
    };
  });

  const topAgents = liveAgentStats(db)
    .sort((a, b) => b.conversions - a.conversions || b.meetings - a.meetings || b.outbound - a.outbound)
    .slice(0, 5);

  return {
    wonDeals,
    lostDeals,
    openDeals: pipelineDeals,
    totalRevenue,
    pipelineValue,
    convRate,
    totalLeads,
    totalConversations,
    resolvedConvs,
    csat,
    campaignSent,
    meetings,
    campaignConv,
    dealsByStage,
    topAgents,
  };
}

/** Um único painel ao vivo — Visão geral, Helena, Pipeline e Analytics leem isto. */
export function liveBoard(db: DB) {
  const a = computeAnalytics(db);
  const now = Date.now();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const convos = db.conversations;
  const prospect = convos.filter((c) => c.flow?.origin === "prospeccao");
  const replied = convos.filter((c) => c.messages.some((m) => m.from === "contact") || c.flow?.state === "respondeu" || c.flow?.state === "reuniao_agendada");
  const waiting = convos.filter((c) => c.status !== "resolvida" && c.messages.at(-1)?.from === "contact");
  const meetings = (db.calendarEvents ?? []).filter((e) => e.status !== "cancelada");
  const upcoming = meetings
    .filter((e) => new Date(e.dataHora).getTime() >= now)
    .sort((x, y) => +new Date(x.dataHora) - +new Date(y.dataHora))
    .slice(0, 6);
  const sdrs = a.topAgents.filter((x) => {
    const ag = db.agents.find((z) => z.id === x.id);
    return ag?.role === "SDR";
  });
  const best = sdrs[0] ?? a.topAgents[0];
  return {
    ...a,
    openDealsCount: a.openDeals.length,
    wonCount: a.wonDeals.length,
    lostCount: a.lostDeals.length,
    leads7d: db.contacts.filter((c) => now - new Date(c.createdAt).getTime() < 7 * 86_400_000).length,
    abordados: prospect.length || convos.filter((c) => c.messages.some((m) => m.from === "agent")).length,
    responderam: replied.length,
    waiting,
    waitingCount: waiting.length,
    staleDeals: a.openDeals.filter((d) => now - new Date(d.updatedAt).getTime() > 48 * 3_600_000).length,
    followupsToday: db.tasks.filter((t) => !t.done && t.type === "follow-up" && new Date(t.dueAt) <= endOfDay).length,
    upcoming,
    meetings,
    workingAgents: db.agents.filter((x) => x.status === "trabalhando").length,
    pendingApprovals: db.approvals.filter((x) => x.status === "pendente").length,
    runningOps: db.operations.filter((o) => o.status === "running").length,
    bestAgent: best ? { name: best.name, rate: best.conversations ? Math.round((best.meetings / Math.max(best.outbound || best.conversations, 1)) * 100) : 0 } : null,
    inboxOpen: convos.filter((c) => c.status === "aberta").length,
  };
}

/** Operação "ao vivo" no menu Operações, espelhando CRM + Inbox + Agenda. */
export function syncLiveCommercial(db: DB) {
  const b = liveBoard(db);
  const id = "op_live_maps";
  const existing = db.operations.find((o) => o.id === id);
  const metrics = {
    responded: b.responderam,
    interested: db.deals.filter((d) => d.status === "aberto" && ["st_qual", "st_reun", "st_prop", "st_neg"].includes(d.stageId)).length,
    qualified: db.deals.filter((d) => d.status === "aberto" && d.stageId !== "st_novo").length,
    meetings: b.meetings.length,
    handoffs: db.conversations.filter((c) => c.handlerType === "human").length,
  };
  const patch: Partial<Operation> = {
    title: "Comercial ao vivo · Maps + WhatsApp",
    objective: "Espelho da operação real: abordagens, respostas, pipeline e reuniões.",
    status: b.abordados ? "running" : "paused",
    total: Math.max(b.abordados, 1),
    processed: b.abordados,
    metrics,
    requestedBy: "Helena",
    agentIds: ["a_sdr1", "a_sdr2", "a_qual", "a_closer", "a_valentina"],
  };
  if (!existing) {
    db.operations.unshift({
      id,
      organizationId: db.organization.id,
      code: "OP-LIVE",
      connectionId: db.salesFlow?.sharedConnectionId ?? "wa_agency",
      cost: 0,
      steps: [
        { id: "s0", label: "Abordar no WhatsApp", status: "running" },
        { id: "s1", label: "Qualificar quem responder", status: "pending" },
        { id: "s2", label: "Agendar reunião", status: "pending" },
      ],
      events: [{ at: new Date().toISOString(), text: "Operação ao vivo ligada ao CRM e ao Inbox", kind: "info" }],
      createdAt: new Date().toISOString(),
      ...patch,
    } as Operation);
  } else {
    Object.assign(existing, patch);
    existing.metrics = metrics;
  }
}
