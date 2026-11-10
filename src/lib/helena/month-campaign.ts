/**
 * Campanha mensal 24/7: meta em R$ (ticket site/cardápio R$ 100/mês).
 * Noite → food que opera à noite · Dia → demais nichos.
 */
import type { RadarSchedule } from "@/lib/types";
import { computeRevenuePlan } from "@/lib/helena/revenue-goal";
import { nowISO, uid, update, getDB } from "@/lib/store";
import { scheduleCyclePush } from "@/lib/persist/cycle";

/** Nichos que trabalham à noite / delivery noturno. */
export const NIGHT_NICHES = [
  "Sorveterias",
  "Açaí",
  "Lanchonetes",
  "Pizzarias",
  "Hamburguerias",
  "Pastelarias",
  "Restaurantes",
];

/** Nichos de dia — sem overindexar food noturno. */
export const DAY_NICHES = [
  "Dentistas",
  "Clínicas Médicas",
  "Clínicas de estética",
  "Advogados",
  "Barbearias",
  "Salões de beleza",
  "Imobiliárias",
  "Pet shops",
  "Contadores",
  "Oficinas mecânicas",
  "Academias",
  "Chaveiros",
  "Arquitetos",
  "Fotógrafos",
];

export const MONTH_TICKET = 100;

export type ShiftKind = "day" | "night";

export function currentShift(now = new Date()): ShiftKind {
  const h = now.getHours();
  // Noite comercial: 18h–23h59 · Dia: 8h–17h59
  if (h >= 18 || h < 6) return "night";
  return "day";
}

export function nichesForShift(shift: ShiftKind): string[] {
  return shift === "night" ? NIGHT_NICHES : DAY_NICHES;
}

export function pickNicheForSchedule(sch: RadarSchedule, now = new Date()): string {
  const list =
    sch.niches?.length ? sch.niches
      : sch.shift === "night" ? NIGHT_NICHES
        : DAY_NICHES;
  if (!list.length) return sch.segment || "negócios locais sem site";
  const idx = ((sch.lastNicheIndex ?? -1) + 1) % list.length;
  return list[idx] || sch.segment;
}

export function monthPlan(goal = 3000) {
  return computeRevenuePlan(goal, {
    ticket: MONTH_TICKET,
    closeRate: 0.25,
    meetingRate: 0.1,
  }, "este mês");
}

export function activateMonthCampaign(opts: {
  goal?: number;
  city?: string;
  nationwide?: boolean;
}): {
  goal: number;
  plan: ReturnType<typeof monthPlan>;
  dayRadarId: string;
  nightRadarId: string;
  campaignIds: string[];
  missionId?: string;
} {
  const goal = Math.max(500, Math.min(Number(opts.goal) || 3000, 50_000));
  const plan = monthPlan(goal);
  const city = String(opts.city || "Brasil").trim() || "Brasil";
  const nationwide = opts.nationwide !== false && /brasil/i.test(city);
  const dailyLimit = Math.min(80, Math.max(20, Math.ceil(plan.leads / 30)));
  const dayId = uid("rad_day_");
  const nightId = uid("rad_night_");
  const campDayId = uid("cp_day_");
  const campNightId = uid("cp_night_");
  let missionId: string | undefined;

  update((d) => {
    if (!d.helenaSettings) return;
    d.helenaSettings.monthlyGoal = goal;
    d.salesFlow.enabled = true;
    d.salesFlow.respectBusinessHours = false; // 24/7 follow-up com visualização
    d.salesFlow.readNoReplyHours = 2;
    d.salesFlow.maxCloserAttempts = 1;

    const team = d.teams.find((t) => t.id === "t_com");
    if (team) team.status = "ativo";
    d.agents.forEach((a) => {
      if (a.teamId === "t_com" && a.status !== "pausado" && a.status !== "erro") {
        a.status = "trabalhando";
        a.currentTask =
          a.role === "Closer" || a.id === "a_closer"
            ? `Fechar meta R$ ${goal.toLocaleString("pt-BR")}/mês`
            : a.role === "SDR"
              ? `Abordagem 24/7 · meta R$ ${goal.toLocaleString("pt-BR")}`
              : `Operação meta R$ ${goal.toLocaleString("pt-BR")}`;
      }
    });

    // Substitui radars antigos por dia + noite.
    d.radarSchedules = d.radarSchedules.filter((s) => s.shift !== "day" && s.shift !== "night");
    const dayRadar: RadarSchedule = {
      id: dayId,
      organizationId: d.organization.id,
      segment: DAY_NICHES[0] || "Dentistas",
      city,
      hour: 8,
      limit: dailyLimit,
      active: true,
      shift: "day",
      windowStart: 8,
      windowEnd: 18,
      niches: [...DAY_NICHES],
      lastNicheIndex: -1,
    };
    const nightRadar: RadarSchedule = {
      id: nightId,
      organizationId: d.organization.id,
      segment: NIGHT_NICHES[0] || "Pizzarias",
      city,
      hour: 18,
      limit: dailyLimit,
      active: true,
      shift: "night",
      windowStart: 18,
      windowEnd: 24,
      niches: [...NIGHT_NICHES],
      lastNicheIndex: -1,
    };
    d.radarSchedules.unshift(nightRadar, dayRadar);

    const list = d.lists[0];
    const cadenceId = d.cadences[0]?.id || "";
    const conn =
      d.connections.find((c) => c.status === "online")?.id
      || d.salesFlow.sharedConnectionId
      || d.connections[0]?.id
      || "wa_agency";
    const sdrIds = d.agents.filter((a) => a.teamId === "t_com").map((a) => a.id);

    d.campaigns = d.campaigns.filter((c) => !/meta\s*r\$|24\/7|noite|diurn/i.test(c.name));
    d.campaigns.unshift(
      {
        id: campNightId,
        organizationId: d.organization.id,
        name: `Meta R$ ${goal.toLocaleString("pt-BR")} · Noite (food)`,
        listId: list?.id || "l2",
        cadenceId,
        agentIds: sdrIds,
        channel: "whatsapp",
        connectionId: conn,
        status: "ativa",
        total: Math.ceil(plan.leads / 2),
        sent: 0,
        replies: 0,
        interested: 0,
        meetings: 0,
        optOuts: 0,
        createdAt: nowISO(),
      },
      {
        id: campDayId,
        organizationId: d.organization.id,
        name: `Meta R$ ${goal.toLocaleString("pt-BR")} · Dia (vários nichos)`,
        listId: list?.id || "l2",
        cadenceId,
        agentIds: sdrIds,
        channel: "whatsapp",
        connectionId: conn,
        status: "ativa",
        total: Math.ceil(plan.leads / 2),
        sent: 0,
        replies: 0,
        interested: 0,
        meetings: 0,
        optOuts: 0,
        createdAt: nowISO(),
      },
    );

    missionId = uid("ms_");
    const end = new Date();
    end.setDate(end.getDate() + 30);
    d.missions.unshift({
      id: missionId,
      organizationId: d.organization.id,
      code: `META-${goal}`,
      title: `Faturar R$ ${goal.toLocaleString("pt-BR")} este mês`,
      objective: `30 dias · ticket R$ ${MONTH_TICKET}/mês · ${plan.sales} fechamentos · ${plan.meetings} reuniões · ~${plan.leads} abordagens. Noite: sorvete/açaí/lanchonete/pizza. Dia: demais nichos.`,
      status: "running",
      priority: "urgente",
      targetMetric: "vendas",
      targetValue: plan.sales,
      currentValue: 0,
      deadline: end.toISOString(),
      budget: 0,
      spent: 0,
      strategy: `Dia ${DAY_NICHES.slice(0, 6).join(", ")}… · Noite ${NIGHT_NICHES.join(", ")} · ~${dailyLimit} leads/turno`,
      supervisorId: "a_supcom",
      agentIds: sdrIds,
      funnel: { prospects: 0, contacted: 0, replied: 0, qualified: 0, meetings: 0, won: 0 },
      createdAt: nowISO(),
      startedAt: nowISO(),
      createdBy: "Helena",
    });
  });

  scheduleCyclePush();
  void nationwide;
  return {
    goal,
    plan,
    dayRadarId: dayId,
    nightRadarId: nightId,
    campaignIds: [campDayId, campNightId],
    missionId,
  };
}

export function activeMonthlyGoal(db = getDB()): number {
  const g = (db.helenaSettings as { monthlyGoal?: number } | undefined)?.monthlyGoal;
  return Number.isFinite(g) && (g as number) > 0 ? Number(g) : 3000;
}
