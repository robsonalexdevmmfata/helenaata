import type { Agent, DB } from "@/lib/types";

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
