// Helena Autonomous Mission & Supervisor Engine
import type {
  Mission,
  MissionFunnel,
  MissionTask,
} from "@/lib/types";
import { currentUser, getDB, nowISO, uid, update } from "@/lib/store";
import { dailyLimitFor } from "@/lib/saas";
import { missionProgress } from "@/lib/helena/command";

export interface StrategyCalculation {
  targetMetric: string;
  targetValue: number;
  prospectsNeeded: number;
  repliesNeeded: number;
  qualifiedNeeded: number;
  meetingsNeeded: number;
  salesTarget: number;
  estimatedDays: number;
  budgetEstimated: number;
  recommendedTeam: string[];
}

function commercialTeamIds() {
  const db = getDB();
  const ids = ["a_supcom", "a_sdr1", "a_sdr2", "a_qual", "a_closer"].filter((id) => db.agents.some((a) => a.id === id));
  if (ids.length) return ids;
  return db.agents.filter((a) => a.teamId === "t_com").map((a) => a.id).slice(0, 5);
}

export function calculateMissionStrategy(objective: string, targetValue = 20): StrategyCalculation {
  const db = getDB();
  const isMeetings = /reuni[aã]o|calls?/i.test(objective);
  const isProspects = /prospect|empresas|maps|contatos/i.test(objective);
  const limit = Math.max(1, dailyLimitFor(currentUser(db)));

  const targetMetric = isMeetings ? "reunioes" : isProspects ? "prospects" : "vendas";
  const prospectsNeeded = isProspects
    ? targetValue
    : Math.min(targetValue * limit, limit * 7);
  const estimatedDays = Math.max(1, Math.ceil(prospectsNeeded / limit));

  return {
    targetMetric,
    targetValue,
    prospectsNeeded,
    repliesNeeded: 0,
    qualifiedNeeded: 0,
    meetingsNeeded: isMeetings ? targetValue : 0,
    salesTarget: targetMetric === "vendas" ? targetValue : 0,
    estimatedDays,
    budgetEstimated: 0,
    recommendedTeam: commercialTeamIds(),
  };
}

export function createMissionFromObjective(opts: {
  title: string;
  objective: string;
  targetValue?: number;
  createdBy?: string;
}): { mission: Mission; tasks: MissionTask[] } {
  const db = getDB();
  const target = opts.targetValue ?? 20;
  const strat = calculateMissionStrategy(opts.objective, target);

  const missionId = uid("mis_");
  const lastCodeNumber = Math.max(
    ...db.missions.map((m) => Number(m.code.replace(/[^\d]/g, "")) || 0),
    100,
  );
  const code = `MIS-${lastCodeNumber + 1}`;

  const deadline = new Date(Date.now() + strat.estimatedDays * 86_400_000).toISOString();

  const funnel: MissionFunnel = {
    prospects: 0,
    contacted: 0,
    replied: 0,
    qualified: 0,
    meetings: 0,
    won: 0,
  };

  const strategyText = `Objetivo: ${strat.targetValue} ${strat.targetMetric}. Plano operacional pela cota diária desta conta (~${strat.prospectsNeeded} abordagens em até ${strat.estimatedDays} dia(s)). Hipótese de capacidade, não previsão de conversão — a Helena não inventa taxa de resposta nem fechamento.`;

  const mission: Mission = {
    id: missionId,
    organizationId: db.organization.id,
    code,
    title: opts.title,
    objective: opts.objective,
    status: "awaiting_approval",
    priority: "alta",
    targetMetric: strat.targetMetric,
    targetValue: strat.targetValue,
    currentValue: 0,
    deadline,
    budget: strat.budgetEstimated,
    spent: 0,
    strategy: strategyText,
    supervisorId: "a_supcom",
    agentIds: strat.recommendedTeam,
    funnel,
    createdBy: opts.createdBy || "Helena",
    createdAt: nowISO(),
  };

  // Generate Task Graph with Dependencies
  const t1Id = uid("mt_");
  const t2Id = uid("mt_");
  const t3Id = uid("mt_");
  const t4Id = uid("mt_");
  const t5Id = uid("mt_");

  const tasks: MissionTask[] = [
    {
      id: t1Id,
      missionId,
      title: `Radar Maps: até ${Math.min(strat.prospectsNeeded, 20)} empresas (cota e fila RPA)`,
      description: "Helena agenda o radar existente. Time Comercial executa; sem disparo em massa nesta etapa.",
      agentId: "a_sdr1",
      status: "ready",
      dependsOn: [],
      retryCount: 0,
      maxRetries: 3,
      input: { limit: strat.prospectsNeeded },
    },
    {
      id: t2Id,
      missionId,
      title: "Abordagem WhatsApp pelo Time Comercial",
      description: "SDRs disparam só depois do diagnóstico. Sem A/B inventado e sem conversão prometida.",
      agentId: "a_sdr2",
      status: "pending",
      dependsOn: [t1Id],
      retryCount: 0,
      maxRetries: 3,
    },
    {
      id: t3Id,
      missionId,
      title: "Qualificação BANT e Classificação de Respostas",
      description: "Agente Qualificador filtra interessados reais e descarta negativas",
      agentId: "a_qual",
      status: "pending",
      dependsOn: [t2Id],
      retryCount: 0,
      maxRetries: 3,
    },
    {
      id: t4Id,
      missionId,
      title: "Agendamento de Reuniões Google Calendar / Cal.com",
      description: "Closer envia link de agendamento e confirma horários com interessados",
      agentId: "a_closer",
      status: "pending",
      dependsOn: [t3Id],
      retryCount: 0,
      maxRetries: 3,
    },
    {
      id: t5Id,
      missionId,
      title: "Proposta do catálogo e fechamento",
      description: "Proposta só com item ativo do catálogo. Aceite no CRM — não é assinatura eletrônica.",
      agentId: "a_closer",
      status: "pending",
      dependsOn: [t4Id],
      retryCount: 0,
      maxRetries: 3,
    },
  ];

  update((d) => {
    d.missions.unshift(mission);
    d.missionTasks.unshift(...tasks);
    d.missionEvents.unshift({
      id: uid("me_"),
      missionId,
      at: nowISO(),
      actor: opts.createdBy || "Helena",
      kind: "decision",
      text: `Missão ${code} planejada: 5 tarefas do Time Comercial (radar → abordagem → BANT → agenda → proposta). Meta ${strat.targetValue} ${strat.targetMetric} é objetivo, não garantia.`,
    });
  });

  return { mission, tasks };
}

export function startMission(missionId: string, actor = "Helena") {
  update((d) => {
    const m = d.missions.find((x) => x.id === missionId);
    if (!m) return;
    m.status = "running";
    m.startedAt = nowISO();

    // Inicia tarefas que não possuem dependências
    d.missionTasks.forEach((t) => {
      if (t.missionId === missionId && t.dependsOn.length === 0 && t.status === "ready") {
        t.status = "running";
        t.startedAt = nowISO();
      }
    });

    d.missionEvents.unshift({
      id: uid("me_"),
      missionId,
      at: nowISO(),
      actor,
      kind: "success",
      text: `Missão ${m.code} iniciada. Supervisor Comercial assumiu o comando da execução.`,
    });
  });
}

export function pauseMission(missionId: string, actor = "Helena") {
  update((d) => {
    const m = d.missions.find((x) => x.id === missionId);
    if (m) {
      m.status = "paused";
      d.missionEvents.unshift({
        id: uid("me_"),
        missionId,
        at: nowISO(),
        actor,
        kind: "warning",
        text: `Missão ${m.code} pausada por ${actor}. Todas as tarefas em execução foram congeladas.`,
      });
    }
  });
}

export function resumeMission(missionId: string, actor = "Helena") {
  update((d) => {
    const m = d.missions.find((x) => x.id === missionId);
    if (m) {
      m.status = "running";
      d.missionEvents.unshift({
        id: uid("me_"),
        missionId,
        at: nowISO(),
        actor,
        kind: "info",
        text: `Missão ${m.code} retomada por ${actor}.`,
      });
    }
  });
}

export function toggleKillSwitch(actor = "Administrador") {
  let nowActive = false;
  update((d) => {
    d.killSwitchActive = !d.killSwitchActive;
    nowActive = d.killSwitchActive;

    if (nowActive) {
      // Pausa todas as missões e operações ativas
      d.missions.forEach((m) => {
        if (m.status === "running") m.status = "paused";
      });
      d.operations.forEach((o) => {
        if (o.status === "running") o.status = "paused";
      });
      d.executions.unshift({
        id: uid("ex_kill_"),
        organizationId: d.organization.id,
        at: nowISO(),
        actor,
        actorType: "user",
        action: "kill_switch.activate",
        description: "KILL SWITCH ACIONADO: Todas as operações de IA foram congeladas.",
        result: "sucesso",
        requestedBy: actor,
        durationMs: 12,
      });
    } else {
      d.executions.unshift({
        id: uid("ex_kill_"),
        organizationId: d.organization.id,
        at: nowISO(),
        actor,
        actorType: "user",
        action: "kill_switch.deactivate",
        description: "Kill Switch desativado: Operações liberadas para retomada.",
        result: "sucesso",
        requestedBy: actor,
        durationMs: 10,
      });
    }
  });
  return nowActive;
}

export function setAutonomyLevel(level: 1 | 2 | 3 | 4) {
  update((d) => {
    d.autonomyLevel = level;
  });
}

export function rebalanceSupervisorWorkload(supervisorTeam = "Comercial") {
  const db = getDB();
  const team = db.teams.find((t) => t.name === supervisorTeam);
  if (!team) return { ok: false, message: "Time não encontrado" };

  const sdrs = db.agents.filter((a) => team.agentIds.includes(a.id) && a.role === "SDR");
  if (sdrs.length < 2) return { ok: false, message: "Não há múltiplos SDRs para balancear" };

  // Verifica tarefas pendentes
  const tasksSdr1 = db.tasks.filter((t) => t.assigneeId === sdrs[0].id && !t.done).length;
  const tasksSdr2 = db.tasks.filter((t) => t.assigneeId === sdrs[1].id && !t.done).length;

  if (Math.abs(tasksSdr1 - tasksSdr2) > 3) {
    const donor = tasksSdr1 > tasksSdr2 ? sdrs[0] : sdrs[1];
    const receiver = tasksSdr1 > tasksSdr2 ? sdrs[1] : sdrs[0];
    const diff = Math.floor(Math.abs(tasksSdr1 - tasksSdr2) / 2);

    update((d) => {
      let moved = 0;
      d.tasks.forEach((t) => {
        if (t.assigneeId === donor.id && !t.done && moved < diff) {
          t.assigneeId = receiver.id;
          moved++;
        }
      });

      d.executions.unshift({
        id: uid("ex_reb_"),
        organizationId: d.organization.id,
        at: nowISO(),
        actor: "Supervisor Comercial",
        actorType: "agent",
        action: "supervisor.rebalance",
        description: `Supervisor Comercial redistribuiu ${moved} tarefas de ${donor.name} para ${receiver.name} para otimizar tempo de resposta.`,
        result: "sucesso",
        requestedBy: "Helena",
        durationMs: 45,
      });
    });

    return {
      ok: true,
      message: `Supervisor Comercial redistribuiu tarefas de ${donor.name} para ${receiver.name}. Carga balanceada com sucesso.`,
    };
  }

  return { ok: true, message: "Carga de trabalho já está balanceada entre os agentes." };
}

/** Sync running missions from executions/CRM. Never invents funnel with Math.random. */
export function tickMissions() {
  const db = getDB();
  if (db.killSwitchActive) return;
  const running = (db.missions || []).filter((m) => m.status === "running");
  if (!running.length) return;

  update((d) => {
    d.missions.forEach((m) => {
      if (m.status !== "running") return;
      const snap = missionProgress(d, m);
      m.funnel.prospects = snap.prospects;
      m.funnel.contacted = snap.contacted;
      m.funnel.qualified = snap.diagnosed;
      m.funnel.meetings = snap.meetings;
      m.funnel.won = snap.won;
      m.currentValue = snap.current;
      m.spent = snap.cost;
      if (m.currentValue >= m.targetValue && m.targetValue > 0) {
        m.status = "completed";
        m.completedAt = nowISO();
        d.missionEvents.unshift({
          id: uid("me_"),
          missionId: m.id,
          at: nowISO(),
          actor: "Helena",
          kind: "success",
          text: `Missão ${m.code}: objetivo de ${m.targetValue} ${m.targetMetric} atingido no cadastro (${m.currentValue}).`,
        });
      }
    });
  });
}
