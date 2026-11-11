/** Helena as orchestrator: briefing, council, conflicts, crisis — only real store data. */
import type { DB, Mission } from "@/lib/types";
import { currentUser } from "@/lib/store";
import { brl, isToday, normalize } from "@/lib/format";
import { commandCenter } from "@/lib/helena/intelligence";
import {
  commercialHealth,
  consumptionSnapshot,
  detectContradictions,
  recoverOpportunities,
} from "@/lib/helena/decision";
import { canUseDevTeam, dailyLimitFor, prospectsUsedToday } from "@/lib/saas";

export type CouncilSeat = {
  team: string;
  agent: string;
  stance: "seguir" | "esperar" | "alertar";
  evidence: string;
};

export function isCompanyStatusQuestion(text: string) {
  const q = normalize(text);
  return /como esta( a| minha)? (empresa|operacao|comercial)|situacao (da |do )?(empresa|comercial|hoje)|briefing (diario|executivo)|o que (esta|ta) acontecendo/.test(q);
}

export function isCouncilQuestion(text: string) {
  const q = normalize(text);
  return /conselho (de )?agentes|ouca os times|avaliacao (independente|dos times)|o que (o comercial|o desenvolvimento|a qualidade) acha/.test(q);
}

export function isCrisisQuestion(text: string) {
  const q = normalize(text);
  return /modo crise|estamos em crise|falha importante|incidente geral/.test(q);
}

export function isMissionPlanIntent(text: string) {
  const q = normalize(text);
  return /planej(e|ar) (a |uma )?missao|mission control|conquistar \d+|meta de \d+ clientes|analise minha operacao|organize as equipes/.test(q);
}

export function missionProgress(db: DB, m: Mission) {
  const since = m.startedAt || m.createdAt;
  const execs = (db.executions || []).filter((e) => e.at >= since);
  const prospects = (db.contacts || []).filter((c) => c.createdAt >= since).length;
  const contacted = execs.filter((e) => /messages\.send|sendText|rpa\.run_shift/i.test(e.action) && e.result === "sucesso").length;
  const diagnosed = execs.filter((e) => e.action === "leads.diagnose" && e.result === "sucesso").length;
  const meetings = (db.calendarEvents || []).filter((e) => e.dataHora >= since && e.status !== "cancelada").length;
  const won = (db.deals || []).filter((d) => d.status === "ganho" && d.updatedAt >= since).length;
  const cost = (db.aiUsage || [])
    .filter((u) => m.agentIds.includes(u.agentId) && `${u.date}T00:00:00.000Z` >= since.slice(0, 10))
    .reduce((s, u) => s + u.cost, 0);
  const current =
    m.targetMetric === "prospects" ? prospects
      : m.targetMetric === "reunioes" ? meetings
        : won;
  return {
    prospects,
    contacted,
    diagnosed,
    meetings,
    won,
    cost,
    current,
    execs: execs.length,
  };
}

export function promiseConflicts(db: DB) {
  const rows: { title: string; detail: string }[] = [];
  const soon = Date.now() + 48 * 3_600_000;
  for (const deal of db.deals.filter((d) => d.status === "aberto")) {
    const close = new Date(deal.expectedClose).getTime();
    if (!Number.isFinite(close) || close > soon) continue;
    const contact = db.contacts.find((c) => c.id === deal.contactId);
    const preview = (db.sitePreviews || []).find((p) => p.contactId === deal.contactId);
    const failed = (db.rpaJobs || []).some((j) => j.contactId === deal.contactId && j.status === "failed");
    if (/site|presenca|preview/i.test(deal.title) && !preview) {
      rows.push({
        title: deal.title,
        detail: `${contact?.name || "Lead"}: comercial com prazo em 48h e ainda não há prévia do Time Dev neste cadastro.`,
      });
    }
    if (failed) {
      rows.push({
        title: deal.title,
        detail: `${contact?.name || "Lead"}: há tarefa RPA com falha e o prazo comercial está perto.`,
      });
    }
  }
  const pendingDev = (db.sitePreviews || []).filter((p) => p.status === "pronta").length;
  const comercialWorking = db.agents.filter((a) => a.teamId === "t_com" && a.status === "trabalhando").length;
  if (pendingDev > 4 && comercialWorking === 0) {
    rows.push({
      title: "Prévia sem abordagem",
      detail: `${pendingDev} prévias prontas e nenhum agente comercial em trabalho agora.`,
    });
  }
  return rows.slice(0, 8);
}

export function crisisState(db: DB) {
  const reasons: string[] = [];
  if (db.killSwitchActive) reasons.push("Kill switch ligado — missões e operações congeladas.");
  const coolUntil = db.helenaSettings?.waCoolUntil;
  const chipCooling = Boolean(coolUntil && Date.now() < new Date(coolUntil).getTime());
  if (chipCooling) {
    reasons.push(`WhatsApp restringido / resfriando até ${new Date(coolUntil!).toLocaleString("pt-BR")} — zero disparo em massa.`);
  }
  const waOffline = db.connections.some((c) => /whatsapp/i.test(c.name) && c.status === "offline");
  if (waOffline) reasons.push("WhatsApp da operação está offline.");
  const failedJobs = (db.rpaJobs || []).filter((j) => j.status === "failed").length;
  if (failedJobs >= 3) reasons.push(`${failedJobs} tarefas RPA com falha na fila.`);
  const cooling = commandCenter(db).cooling;
  if (cooling >= 5) reasons.push(`${cooling} oportunidades esfriando ou paradas no dossiê.`);
  const pending = db.approvals.filter((a) => a.status === "pendente").length;
  if (pending >= 5) reasons.push(`${pending} aprovações travando execução.`);
  const active = reasons.length >= 2 || chipCooling || db.killSwitchActive;
  return {
    active,
    reasons,
    plan: active
      ? [
          "Helena orquestra; não dispara sozinha.",
          chipCooling || waOffline
            ? "Time Comercial: não enviar em massa até a Meta liberar o chip."
            : "Time Comercial: só follow-up com opt-out e horário comercial.",
          failedJobs ? "Operações: reprocessar RPA falho uma a uma, sem lote." : "Operações: manter a fila existente.",
          "Qualidade: nenhuma promessa nova até o comercial confirmar capacidade.",
        ]
      : ["Sem evento que justifique modo crise. Continue no expediente normal."],
  };
}

export function agentCouncil(db: DB, objective?: string) {
  const cc = commandCenter(db);
  const cons = consumptionSnapshot(db);
  const rec = recoverOpportunities(db);
  const user = currentUser(db);
  const used = prospectsUsedToday(user);
  const limit = dailyLimitFor(user);
  const failed = (db.rpaJobs || []).filter((j) => j.status === "failed").length;
  const previews = db.sitePreviews || [];
  const contra = (db.commercialDossiers || []).flatMap((d) => detectContradictions(d.evidence || [], db.contacts.find((c) => c.id === d.contactId)?.tags || []));

  const comercial: CouncilSeat = {
    team: "Comercial",
    agent: db.agents.find((a) => a.id === "a_supcom")?.name || "Supervisor Comercial",
    stance: cc.hot > 0 ? "seguir" : rec.length ? "alertar" : "esperar",
    evidence: cc.hot
      ? `${cc.hot} lead(s) quente(s) no cadastro. Próxima ação no dossiê, não volume.`
      : rec.length
        ? `${rec.length} oportunidade(s) para recuperar. Sem inventar interesse.`
        : "Nenhum sinal quente escrito. Comercial não deve disparar só para 'ocupar o dia'.",
  };

  const ops: CouncilSeat = {
    team: "Operações",
    agent: "Helena (orquestração)",
    stance: used >= limit || failed >= 3 ? "alertar" : used > 0 ? "seguir" : "esperar",
    evidence: `Cota ${used}/${limit} hoje. ${cons.rpa} job(s) RPA no dia. ${failed} falha(s) na fila. ${cons.execToday} execuções registradas.`,
  };

  const devAllowed = canUseDevTeam(user);
  const dev: CouncilSeat = {
    team: "Desenvolvimento IA",
    agent: db.agents.find((a) => a.id === "a_dev_fe")?.name || "Time Dev",
    stance: !devAllowed ? "esperar" : previews.some((p) => p.status === "pronta") ? "seguir" : "esperar",
    evidence: devAllowed
      ? `${previews.length} prévia(s) no cadastro (${previews.filter((p) => p.status === "pronta").length} pronta(s)). Dev só entra se o plano Máquina permitir.`
      : "Time Dev não está liberado nesta conta (trial/Impulso). Helena não simula engenheiro.",
  };

  const qualidade: CouncilSeat = {
    team: "Qualidade",
    agent: db.agents.find((a) => a.id === "a_qual")?.name || "Qualificador",
    stance: contra.length ? "alertar" : "seguir",
    evidence: contra.length
      ? `${contra.length} contradição(ões) evidência × tag. Não abordar até o dossiê bater.`
      : "Sem contradição aberta nos dossiês lidos agora.",
  };

  const seats = [comercial, ops, dev, qualidade];
  const alerts = seats.filter((s) => s.stance === "alertar").length;
  const follows = seats.filter((s) => s.stance === "seguir").length;
  const recommendation =
    alerts >= 2
      ? "Conselho: não iniciar missão nova. Resolver cota, WhatsApp, falhas RPA ou contradição primeiro."
      : follows >= 2
        ? "Conselho: seguir no que o cadastro já aponta (quente, recuperação ou prévia pronta). Helena orquestra os times existentes."
        : "Conselho: esperar sinal no cadastro. Objetivo informado não vira previsão.";
  return {
    objective: objective?.trim() || "Situação atual da operação",
    seats,
    recommendation,
    note: "Votos independentes com evidência desta organização. Não é consenso de modelo nem garantia de resultado.",
  };
}

export function companyBriefing(db: DB) {
  const cc = commandCenter(db);
  const health = commercialHealth(db);
  const cons = consumptionSnapshot(db);
  const crisis = crisisState(db);
  const conflicts = promiseConflicts(db);
  const missions = (db.missions || []).filter((m) => m.status === "running" || m.status === "awaiting_approval");
  const sendsToday = db.executions.filter((e) => /sendText|messages\.send/i.test(e.action) && e.result === "sucesso" && isToday(e.at)).length;
  const meetingsToday = (db.calendarEvents ?? []).filter((e) => isToday(e.dataHora) && e.status !== "cancelada").length;
  const wonMonth = db.deals.filter((d) => d.status === "ganho").reduce((s, d) => s + d.value, 0);

  const happened = [
    `Cota de prospecção hoje ${cons.used}/${cons.limit}.`,
    `${cons.dxToday} diagnóstico(s) e ${sendsToday} envio(s) WhatsApp com execução de sucesso hoje.`,
    `${meetingsToday} reunião(ões) na Agenda hoje. Faturamento ganho no cadastro: ${brl(wonMonth)}.`,
  ];
  const happening = [
    missions.length ? `${missions.length} missão(ões) em comando (${missions.map((m) => m.code).join(", ")}).` : "Nenhuma missão no Mission Control.",
    `${cc.hot} quente(s), ${cc.cooling} em risco, ${cc.waiting} proposta(s) aguardando.`,
    `${db.operations.filter((o) => o.status === "running").length} operação(ões) e ${db.approvals.filter((a) => a.status === "pendente").length} aprovação(ões) pendente(s).`,
  ];
  const risks = [
    ...crisis.reasons,
    ...conflicts.map((c) => c.detail),
    health.detail,
  ].filter(Boolean);
  const rec = recoverOpportunities(db);
  const next = rec.length
    ? rec.slice(0, 3).map((r) => `${r.name}: ${r.action}`)
    : cc.today.length
      ? cc.today.map((t) => `${t.name}: ${t.action?.label || "próxima ação no dossiê"}`)
      : ["Sem gatilho novo no cadastro. Helena não inventa o que fazer."];

  const text = [
    `Como está a ${db.organization.name} agora — só o que está no cadastro.`,
    `Aconteceu: ${happened.join(" ")}`,
    `Está acontecendo: ${happening.join(" ")}`,
    `Pode dar errado: ${risks.slice(0, 4).join(" ") || "Nenhum alerta estrutural agora."}`,
    `Recomendo: ${next.join(" ")}`,
    crisis.active ? `Modo crise: ${crisis.plan[0]}` : "Fora de modo crise.",
  ].join("\n");

  return {
    text,
    highlights: [
      { label: "Cota hoje", value: `${cons.used}/${cons.limit}` },
      { label: "Quentes", value: String(cc.hot) },
      { label: "Risco / esfriando", value: String(cc.cooling) },
      { label: "Missões", value: String(missions.length) },
      { label: "Saúde", value: health.label },
      { label: "Crise", value: crisis.active ? "sim" : "não" },
    ],
    happened,
    happening,
    risks: risks.slice(0, 6),
    next,
    crisis,
    conflicts,
    council: agentCouncil(db),
  };
}

export function loadBalanceHint(db: DB) {
  const byTeam = new Map<string, { name: string; open: number; agents: number }>();
  for (const t of db.teams) {
    const agents = db.agents.filter((a) => t.agentIds.includes(a.id));
    const open = db.tasks.filter((x) => !x.done && agents.some((a) => a.id === x.assigneeId)).length;
    byTeam.set(t.id, { name: t.name, open, agents: agents.filter((a) => a.status !== "pausado" && a.status !== "erro").length });
  }
  const rows = [...byTeam.values()];
  const max = rows.reduce((a, b) => (a.open > b.open ? a : b), rows[0]);
  const min = rows.reduce((a, b) => (a.open < b.open ? a : b), rows[0]);
  if (!max || !min || max.open - min.open < 4) {
    return "Carga de tarefas entre times está equilibrada o bastante. Helena não move trabalho sem desvio claro.";
  }
  return `${max.name} tem ${max.open} tarefas abertas; ${min.name} tem ${min.open}. Redistribuir só dentro do mesmo time (Supervisor Comercial), sem inventar departamento.`;
}
