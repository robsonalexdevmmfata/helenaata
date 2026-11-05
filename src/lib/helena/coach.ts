/**
 * Helena como SO do produto: ensina a usar, opera e cuida do follow-up.
 * O currículo é curto e baseado no estado real da conta — sem teatro.
 */
import type { DB } from "@/lib/types";
import { isToday } from "@/lib/format";

export type CoachStepId =
  | "whatsapp"
  | "prospectar"
  | "pipeline"
  | "inbox"
  | "followup"
  | "dev_preview"
  | "agenda"
  | "autonomy";

export interface CoachStep {
  id: CoachStepId;
  title: string;
  why: string;
  sayToHelena: string;
  href: string;
  done: boolean;
}

export function coachSteps(db: DB): CoachStep[] {
  const waOnline = db.connections.some((c) => !c.deletedAt && c.status === "online");
  const hasLeads = db.contacts.some((c) => c.source === "Prospecção" || c.tags.some((t) => /sem-site|maps/i.test(t)));
  const hasDeals = db.deals.some((d) => d.status === "aberto");
  const hasConvs = db.conversations.some((c) => c.flow?.origin === "prospeccao" || c.channel === "whatsapp");
  const followPending =
    db.tasks.some((t) => !t.done && t.type === "follow-up") ||
    db.deals.some((d) => d.status === "aberto" && Date.now() - new Date(d.updatedAt).getTime() > 48 * 3_600_000);
  const hasPreview = (db.sitePreviews?.length ?? 0) > 0;
  const hasMeeting = (db.calendarEvents ?? []).some((e) => e.status !== "cancelada" && isToday(e.dataHora));
  const fuAgent = db.agents.find((a) => a.id === "a_fu");
  const fuOn = fuAgent ? fuAgent.status === "trabalhando" || fuAgent.status === "aguardando" : false;

  return [
    {
      id: "whatsapp",
      title: "Conectar o WhatsApp",
      why: "Sem chip online eu não disparo nem leio o Inbox.",
      sayToHelena: "Helena, conecta o WhatsApp",
      href: "/integracoes/whatsapp",
      done: waOnline,
    },
    {
      id: "prospectar",
      title: "Caçar leads no mapa",
      why: "Eu varro o Maps, mando pro Pipeline e o Time Comercial aborda.",
      sayToHelena: "Helena, gere 20 leads de dentistas em Campinas",
      href: "/prospeccao/buscar",
      done: hasLeads,
    },
    {
      id: "pipeline",
      title: "Olhar o Pipeline",
      why: "Toda oportunidade nova cai em Novo lead — eu orquestro, você só acompanha.",
      sayToHelena: "Helena, como está o pipeline?",
      href: "/crm/pipeline",
      done: hasDeals,
    },
    {
      id: "inbox",
      title: "Inbox e respostas",
      why: "Marina/Camila abrem; se o lead responder, Rafael e André entram.",
      sayToHelena: "Helena, quem está esperando resposta?",
      href: "/atendimento/inbox",
      done: hasConvs,
    },
    {
      id: "followup",
      title: "Follow-up automático",
      why: "Eu cuido de quem sumiu: Lucas (follow-up), Valentina (48h) e resgate de frios.",
      sayToHelena: "Helena, cuida dos follow-ups",
      href: "/crm/tarefas",
      done: !followPending && (hasLeads || hasDeals),
    },
    {
      id: "dev_preview",
      title: "Prévia de site/cardápio (R$ 100/mês)",
      why: "Time Dev sobe front na Vercel; comercial manda o link pro dono.",
      sayToHelena: "Helena, monte prévia de 5 restaurantes sem cardápio em São Paulo",
      href: "/ia/previews",
      done: hasPreview,
    },
    {
      id: "agenda",
      title: "Agenda compartilhada",
      why: "Horário fechado vira reunião na Agenda — eu registro.",
      sayToHelena: "Helena, o que tem na agenda hoje?",
      href: "/ia/agenda",
      done: hasMeeting,
    },
    {
      id: "autonomy",
      title: "Deixar eu administrar",
      why: "Com chip online e time ativo, eu ensino, opero e faço follow-up sem você clicar em tudo.",
      sayToHelena: "Helena, assume o comercial e cuida de tudo",
      href: "/ia/helena",
      done: waOnline && hasLeads && fuOn,
    },
  ];
}

export function nextCoachStep(db: DB): CoachStep | undefined {
  return coachSteps(db).find((s) => !s.done);
}

export function coachGuideText(db: DB, topic?: string): { text: string; steps: CoachStep[]; next?: CoachStep } {
  const steps = coachSteps(db);
  const next = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  const n = (topic || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/whatsapp|chip|conectar|qr/.test(n)) {
    const s = steps.find((x) => x.id === "whatsapp")!;
    return {
      text: `${s.done ? "WhatsApp já está online." : "Primeiro passo: Integrações → WhatsApp → Conectar e escanear o QR."} Digite: “${s.sayToHelena}” se quiser que eu te guie.`,
      steps: [s],
      next: s.done ? next : s,
    };
  }
  if (/follow|retorno|resgatar|frio/.test(n)) {
    const s = steps.find((x) => x.id === "followup")!;
    return {
      text: `Follow-up é comigo: diga “cuida dos follow-ups” que eu aciono Lucas, Valentina e o resgate de leads parados. ${s.done ? "Agora está em dia." : "Há pendências na base."}`,
      steps: [s],
      next: s,
    };
  }
  if (/pipeline|crm|oportun/.test(n)) {
    const s = steps.find((x) => x.id === "pipeline")!;
    return {
      text: `Pipeline em CRM → Pipeline. Cada lead da varredura vira oportunidade em Novo lead. Eu administro; você só decide quando eu pedir aprovação de risco alto.`,
      steps: [s],
      next: s.done ? next : s,
    };
  }
  if (/site|cardapio|dev|vercel|previa/.test(n)) {
    const s = steps.find((x) => x.id === "dev_preview")!;
    return {
      text: `Site e cardápio: R$ 100/mês. O Time Dev (Caio, Diego, Sofia) publica só o front na Vercel com link público. Peça: “${s.sayToHelena}”.`,
      steps: [s],
      next: s,
    };
  }

  const lines = steps.map((s, i) => `${s.done ? "✓" : `${i + 1}.`} ${s.title}${s.done ? "" : ` — diga: “${s.sayToHelena}”`}`);
  const text = `Eu sou a Helena: ensino o painel, opero prospecção/CRM/WhatsApp/times e cuido do follow-up.

Progresso ${doneCount}/${steps.length}.
${lines.join("\n")}

${next ? `Próximo passo agora: ${next.title}. ${next.why} Fale comigo: “${next.sayToHelena}”.` : "Conta no ponto — diga o que quer que eu rode (leads, follow-up, prévia, agenda)."}`;

  return { text, steps, next };
}

export function autonomyBrief(db: DB): string {
  const next = nextCoachStep(db);
  const stale = db.deals.filter((d) => d.status === "aberto" && Date.now() - new Date(d.updatedAt).getTime() > 48 * 3_600_000).length;
  const unread = db.conversations.filter((c) => c.unread > 0).length;
  return [
    "Eu administro este sistema: ensino, orquestro o time e faço follow-up.",
    next ? `Próximo ensino: ${next.title} (${next.href}).` : "Onboarding completo.",
    stale ? `${stale} oportunidades >48h — diga “cuida dos follow-ups” que eu resolvo.` : "Follow-up em dia.",
    unread ? `${unread} no Inbox esperando resposta.` : "Inbox limpo.",
  ].join(" ");
}
