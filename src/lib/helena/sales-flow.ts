// Regras do número comercial compartilhado (funções puras, sem tocar no store).
// Fluxo: prospecção aborda -> cliente não responde (ou visualiza e não responde)
// -> a Closer entra para agendar reunião e fechar. O servidor (server/sales-flow.mjs)
// segue exatamente as mesmas regras com mensagens reais da Evolution API.
import type { Conversation, FlowState, Meeting, SalesFlowSettings } from "@/lib/types";
import { normalize } from "@/lib/format";

const HOUR = 3_600_000;
const MIN = 60_000;

type HoursRule = Pick<SalesFlowSettings, "respectBusinessHours" | "businessStart" | "businessEnd">;

export function isBusinessTime(d: Date, s: HoursRule) {
  if (!s.respectBusinessHours) return true;
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= s.businessStart && h < s.businessEnd;
}

/** Primeiro instante em horário comercial a partir de `from` (o próprio, se já for). */
export function nextBusinessTime(from: Date, s: HoursRule): Date {
  if (isBusinessTime(from, s)) return new Date(from);
  const d = new Date(from);
  const day = d.getDay();
  const h = d.getHours() + d.getMinutes() / 60;
  if (day !== 0 && day !== 6 && h < s.businessStart) {
    d.setHours(s.businessStart, 0, 0, 0);
    return d;
  }
  for (let i = 0; i < 8; i++) {
    d.setDate(d.getDate() + 1);
    d.setHours(s.businessStart, 0, 0, 0);
    if (isBusinessTime(d, s)) return d;
  }
  return d;
}

export type FollowupReason = "sem_resposta" | "visualizou_sem_responder";
export type FollowupDecision =
  | { action: "none"; dueAt?: string; reason?: FollowupReason }
  | { action: "closer"; reason: FollowupReason }
  | { action: "esfriou" };

const WATCHED: FlowState[] = ["abordado", "visualizou", "closer"];

/**
 * Decide se a Closer deve entrar agora numa conversa do número compartilhado.
 * - só vale para conversas iniciadas pela prospecção (quando a regra estiver ligada);
 * - se um humano assumiu ou o cliente respondeu, ninguém entra;
 * - sem resposta por `noReplyHours`, ou visualizou e ficou `readNoReplyHours` calado → Closer;
 * - depois de `maxCloserAttempts` tentativas sem retorno, o lead esfria.
 */
export function evaluateFollowup(conv: Conversation, s: SalesFlowSettings, now = new Date()): FollowupDecision {
  const f = conv.flow;
  if (!s.enabled || !f) return { action: "none" };
  if (s.onlyAfterProspecting && f.origin !== "prospeccao") return { action: "none" };
  if (conv.handlerType === "human" || conv.status === "resolvida") return { action: "none" };
  if (!WATCHED.includes(f.state)) return { action: "none" };
  if (f.repliedAt && f.repliedAt >= f.lastOutboundAt) return { action: "none" };

  const read = !!f.readAt && f.readAt >= f.lastOutboundAt;
  const reason: FollowupReason = read ? "visualizou_sem_responder" : "sem_resposta";
  const base = new Date(read ? f.readAt! : f.lastOutboundAt).getTime();
  const wait = (read ? s.readNoReplyHours : s.noReplyHours) * HOUR;
  const due = nextBusinessTime(new Date(base + wait), s);
  if (now.getTime() < due.getTime()) return { action: "none", dueAt: due.toISOString(), reason };
  if (f.state === "closer" && f.closerAttempts >= s.maxCloserAttempts) return { action: "esfriou" };
  return { action: "closer", reason };
}

/** Existe outra reunião (não cancelada) do mesmo responsável que se sobrepõe? */
export function hasConflict(meetings: Meeting[], ownerId: string, startISO: string, durationMin: number, ignoreId?: string) {
  const start = new Date(startISO).getTime();
  const end = start + durationMin * MIN;
  return meetings.some((m) => {
    if (m.id === ignoreId || m.ownerId !== ownerId) return false;
    if (m.status === "cancelada") return false;
    const ms = new Date(m.startAt).getTime();
    const me = ms + m.durationMin * MIN;
    return start < me && ms < end;
  });
}

/** Horários livres em horário comercial, de hora em hora, a partir de 2h depois de `from`. */
export function suggestSlots(meetings: Meeting[], ownerId: string, from: Date, s: SalesFlowSettings, count = 2): Date[] {
  const slots: Date[] = [];
  const cursor = new Date(from.getTime() + 2 * HOUR);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);
  let guard = 0;
  let lastDay = -1;
  while (slots.length < count && guard++ < 24 * 14) {
    const t = nextBusinessTime(cursor, { ...s, respectBusinessHours: true });
    const fitsDay = t.getHours() + s.meetingDurationMin / 60 <= s.businessEnd;
    // Oferece no máximo um horário por dia para dar opções em dias diferentes.
    if (fitsDay && t.getDate() !== lastDay && !hasConflict(meetings, ownerId, t.toISOString(), s.meetingDurationMin)) {
      slots.push(new Date(t));
      lastDay = t.getDate();
    }
    cursor.setTime(t.getTime() + HOUR);
  }
  return slots;
}

const WEEKDAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/** "hoje às 16h", "amanhã às 10h30", "segunda às 9h", "12/11 às 15h". */
export function slotLabel(d: Date, now = new Date()) {
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayD - day0) / 86_400_000);
  const hh = `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`;
  const names = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const day =
    diff === 0 ? "hoje" : diff === 1 ? "amanhã" : diff > 1 && diff < 7 ? names[d.getDay()] : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${day} às ${hh}`;
}

/**
 * Entende data/hora em português: "amanhã às 15h", "sexta 10h30", "12/11 às 9",
 * "hoje 16:00". Retorna null quando não há nada de data nem hora.
 */
export function parseWhen(text: string, now = new Date()): { date: Date; hasTime: boolean } | null {
  let n = normalize(text);
  let base: Date | null = null;

  const dm = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const year = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : now.getFullYear();
    base = new Date(year, Number(dm[2]) - 1, Number(dm[1]));
    if (!dm[3] && base.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) base.setFullYear(year + 1);
    n = n.replace(dm[0], " ");
  } else if (/depois de amanha/.test(n)) {
    base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  } else if (/\bamanha\b/.test(n)) {
    base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (/\bhoje\b/.test(n)) {
    base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else {
    const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}(-feira)?\\b`).test(n));
    if (wd >= 0) {
      let add = (wd - now.getDay() + 7) % 7;
      if (add === 0) add = 7;
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
    }
  }

  const tm =
    n.match(/\b(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?\b/) ?? n.match(/\b(?:as|a partir das)\s+(\d{1,2})\b/);
  let hour: number | null = null;
  let minute = 0;
  if (tm) {
    const h = Number(tm[1]);
    if (h >= 0 && h <= 23) {
      hour = h;
      minute = tm[2] ? Math.min(59, Number(tm[2])) : 0;
    }
  }
  if (hour === null && /\bmeio.?dia\b/.test(n)) hour = 12;

  if (!base && hour === null) return null;
  if (!base) {
    base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const candidate = new Date(base);
    candidate.setHours(hour!, minute, 0, 0);
    if (candidate.getTime() <= now.getTime()) base.setDate(base.getDate() + 1);
  }
  const date = new Date(base);
  date.setHours(hour ?? 10, hour === null ? 0 : minute, 0, 0);
  return { date, hasTime: hour !== null };
}

/** Cliente escolheu um dos horários oferecidos? ("pode ser o primeiro", "o segundo", "esse mesmo"). */
export function pickProposedSlot(text: string, slots: string[] | undefined): string | null {
  if (!slots?.length) return null;
  const n = normalize(text);
  if (/\b(segundo|segunda opcao|2a|opcao 2|o 2)\b/.test(n) && slots[1]) return slots[1];
  if (/\b(primeiro|primeira|1a|opcao 1|o 1|esse|pode ser|fechado|combinado|beleza|ok|sim|perfeito|bora)\b/.test(n)) return slots[0];
  return null;
}

/** Mensagem da Closer: curta, humana, sem emojis, sempre com dois horários. */
export function closerFollowupText(opts: {
  contactName: string;
  closerName: string;
  company: string;
  attempt: number;
  reason: FollowupReason;
  slots: Date[];
  now?: Date;
}) {
  const first = opts.contactName.replace(/^(Dra?\.)\s*/, "$1 ").split(" ").slice(0, /^Dra?\./.test(opts.contactName) ? 2 : 1).join(" ");
  const [a, b] = opts.slots.map((s) => slotLabel(s, opts.now));
  const options = b ? `${a} ou ${b}` : a;
  if (opts.attempt <= 1 && opts.reason === "visualizou_sem_responder") {
    return `${first}, vi que você chegou a ver a mensagem. Sei que a rotina é corrida, então vou direto ao ponto: quem procura o seu serviço no Google hoje fecha com quem aparece primeiro. Em 15 minutos te mostro como colocamos a sua empresa nessa frente. Fica melhor ${options}?`;
  }
  if (opts.attempt <= 1) {
    return `${first}, tudo bem? Aqui é a ${opts.closerName}, da ${opts.company}. Não quero que vocês percam mais clientes para quem já aparece no Google. Separei dois horários para uma conversa rápida de 15 minutos: ${options}. Qual fica melhor para você?`;
  }
  return `${first}, prometo que é a última por aqui para não incomodar. Ainda consigo segurar a condição de entrada, com projeto a partir de R$ 3.000 e parcelamento. Posso reservar ${a} para te mostrar? Se preferir outro horário, é só me dizer qual.`;
}

export const FLOW_STATE_LABEL: Record<FlowState, string> = {
  abordado: "Abordado",
  visualizou: "Visualizou",
  respondeu: "Respondeu",
  closer: "Closer em ação",
  reuniao_agendada: "Reunião agendada",
  esfriou: "Esfriou",
};

export const FOLLOWUP_REASON_LABEL: Record<FollowupReason, string> = {
  sem_resposta: "não respondeu",
  visualizou_sem_responder: "visualizou e não respondeu",
};
