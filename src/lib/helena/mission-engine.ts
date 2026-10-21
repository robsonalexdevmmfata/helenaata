// Helena Autonomous Mission & Supervisor Engine
import type {
  AbExperiment,
  AgentHealth,
  DB,
  Mission,
  MissionEvent,
  MissionFunnel,
  MissionTask,
} from "@/lib/types";
import { getDB, nowISO, uid, update } from "@/lib/store";

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

export function calculateMissionStrategy(objective: string, targetValue = 20): StrategyCalculation {
  const isMeetings = /reuni[aã]o|calls?/i.test(objective);
  const isProspects = /prospect|empresas|maps|contatos/i.test(objective);

  let salesTarget = targetValue;
  let meetingsNeeded = Math.ceil(salesTarget / 0.55);
  let qualifiedNeeded = Math.ceil(meetingsNeeded / 0.6);
  let repliesNeeded = Math.ceil(qualifiedNeeded / 0.4);
  let prospectsNeeded = Math.ceil(repliesNeeded / 0.15);

  if (isMeetings) {
    meetingsNeeded = targetValue;
    salesTarget = Math.round(meetingsNeeded * 0.55);
    qualifiedNeeded = Math.ceil(meetingsNeeded / 0.6);
    repliesNeeded = Math.ceil(qualifiedNeeded / 0.4);
    prospectsNeeded = Math.ceil(repliesNeeded / 0.15);
  } else if (isProspects) {
    prospectsNeeded = targetValue;
    repliesNeeded = Math.round(prospectsNeeded * 0.15);
    qualifiedNeeded = Math.round(repliesNeeded * 0.4);
    meetingsNeeded = Math.round(qualifiedNeeded * 0.6);
    salesTarget = Math.round(meetingsNeeded * 0.55);
  }

  const budgetEstimated = Math.round(prospectsNeeded * 0.45);
  const estimatedDays = Math.max(14, Math.ceil(prospectsNeeded / 40));

  return {
    targetMetric: isMeetings ? "reunioes" : isProspects ? "prospects" : "vendas",
    targetValue,
    prospectsNeeded,
    repliesNeeded,
    qualifiedNeeded,
    meetingsNeeded,
    salesTarget,
    estimatedDays,
    budgetEstimated,
    recommendedTeam: ["a_supcom", "a_sdr1", "a_sdr2", "a_qual", "a_closer"],
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

  const strategyText = `Meta de ${strat.targetValue} ${strat.targetMetric}. Necessários ~${strat.prospectsNeeded} prospects, ${strat.repliesNeeded} respostas, ${strat.qualifiedNeeded} qualificados e ${strat.meetingsNeeded} reuniões para atingir ${strat.salesTarget} fechamentos em ${strat.estimatedDays} dias com orçamento de R$ ${strat.budgetEstimated}.`;

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
      title: `Varredura Google Maps: ${strat.prospectsNeeded} empresas sem site`,
      description: "Identificar negócios locais sem site e injetar no CRM com tag #sem-site",
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
      title: "Abordagem Consultiva WhatsApp (Teste A/B)",
      description: "Disparo do primeiro contato com split de variantes A/B pelo SDR 01 e SDR 02",
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
      title: "Apresentação de Proposta e Fechamento",
      description: "Condução das reuniões e assinatura de contratos",
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
      text: `Missão ${code} planejada com decomposição de 5 tarefas interdependentes e meta de ${strat.targetValue} ${strat.targetMetric}.`,
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

// Background simulation ticker for autonomous missions
export function tickMissions() {
  const db = getDB();
  if (db.killSwitchActive) return;

  const runningMissions = db.missions.filter((m) => m.status === "running");
  if (runningMissions.length === 0) return;

  update((d) => {
    d.missions.forEach((m) => {
      if (m.status !== "running") return;

      const tasks = d.missionTasks.filter((t) => t.missionId === m.id);

      // Check task dependency progression
      tasks.forEach((t) => {
        if (t.status === "pending") {
          const depsComplete = t.dependsOn.every((depId) => {
            const depTask = tasks.find((x) => x.id === depId);
            return depTask && depTask.status === "completed";
          });
          if (depsComplete) {
            t.status = "running";
            t.startedAt = nowISO();
            d.missionEvents.unshift({
              id: uid("me_"),
              missionId: m.id,
              at: nowISO(),
              actor: "Supervisor Comercial",
              kind: "info",
              text: `Dependências concluídas. Tarefa "${t.title}" iniciada.`,
            });
          }
        }
      });

      // Advance funnel simulation incrementally
      if (m.funnel.prospects < m.targetValue * 40) {
        m.funnel.prospects += Math.floor(Math.random() * 4) + 1;
        if (m.funnel.prospects > 10 && m.funnel.contacted < m.funnel.prospects) {
          m.funnel.contacted += Math.floor(Math.random() * 3) + 1;
        }
        if (m.funnel.contacted > 8 && m.funnel.replied < Math.floor(m.funnel.contacted * 0.2)) {
          m.funnel.replied += 1;
        }
        if (m.funnel.replied > 4 && m.funnel.qualified < Math.floor(m.funnel.replied * 0.45)) {
          m.funnel.qualified += 1;
        }
        if (m.funnel.qualified > 2 && m.funnel.meetings < Math.floor(m.funnel.qualified * 0.6)) {
          m.funnel.meetings += 1;
        }
        if (m.funnel.meetings > 1 && m.funnel.won < Math.floor(m.funnel.meetings * 0.55)) {
          m.funnel.won += 1;
          m.currentValue = m.funnel.won;
        }
      }

      // Check mission completion
      if (m.currentValue >= m.targetValue) {
        m.status = "completed";
        m.completedAt = nowISO();
        d.missionEvents.unshift({
          id: uid("me_"),
          missionId: m.id,
          at: nowISO(),
          actor: "Helena",
          kind: "success",
          text: `🎉 META ATINGIDA! A Missão ${m.code} (${m.title}) foi concluída com sucesso com ${m.currentValue} ${m.targetMetric}.`,
        });
      }
    });

    // Check A/B testing thresholds
    d.abExperiments.forEach((exp) => {
      if (exp.status === "running") {
        exp.variantA.sent += Math.floor(Math.random() * 2);
        exp.variantB.sent += Math.floor(Math.random() * 2);
        if (exp.variantA.sent > 25 && Math.random() > 0.65) exp.variantA.replies += 1;
        if (exp.variantB.sent > 25 && Math.random() > 0.5) exp.variantB.replies += 1;

        const rateA = exp.variantA.replies / Math.max(1, exp.variantA.sent);
        const rateB = exp.variantB.replies / Math.max(1, exp.variantB.sent);

        if (exp.variantA.sent >= 50 && exp.variantB.sent >= 50) {
          exp.status = "completed";
          exp.winner = rateB > rateA ? "B" : "A";
          exp.recommendation =
            exp.winner === "B"
              ? `Variante B superou a Variante A com ${(rateB * 100).toFixed(1)}% de resposta vs ${(rateA * 100).toFixed(1)}%. Helena adotou a abordagem B para todas as novas prospecções.`
              : `Variante A manteve a melhor taxa de conversão (${(rateA * 100).toFixed(1)}%).`;
        }
      }
    });
  });
}
