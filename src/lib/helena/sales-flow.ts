// Regras do número comercial compartilhado (funções puras, sem tocar no store).
// Fluxo: prospecção aborda -> cliente não responde (ou visualiza e não responde)
// -> a Closer entra para agendar reunião e fechar. O servidor (server/sales-flow.mjs)
// segue exatamente as mesmas regras com mensagens reais da Evolution API.
import type { Conversation, FlowState, Meeting, SalesFlowSettings } from "@/lib/types";
import { normalize } from "@/lib/format";
import { buildReadFollowupText } from "@/lib/helena/inbox-brain";

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
/** Tempo curto depois do ✓✓ azul: continuidade da prospecção / prévia. */
export const READ_CONTINUITY_HOURS = 2;

/** Quantas mensagens do time estão empilhadas sem o cliente ter falado. */
/** Conta só mensagens que de fato saíram no WhatsApp (não rascunho/fila/falha). */
export function wasDeliveredOutbound(m: { from: string; deliveryStatus?: string; externalId?: string }) {
  if (m.from !== "agent" && m.from !== "helena") return false;
  if (m.deliveryStatus === "queued" || m.deliveryStatus === "failed") return false;
  if (m.deliveryStatus === "sent" || m.deliveryStatus === "delivered" || m.deliveryStatus === "read") return true;
  if (m.externalId) return true;
  // Legacy sem status: assume enviado (fantasmas sem Evolution são marcados "failed" no repair).
  return m.deliveryStatus == null;
}

export function unansweredAgentStreak(conv: Pick<Conversation, "messages">): number {
  let n = 0;
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (!m) break;
    if (m.from === "contact") break;
    if (wasDeliveredOutbound(m)) n += 1;
  }
  return n;
}

/** Já abordamos este número e ainda não teve resposta — não mandar de novo agora. */
export function shouldHoldOutbound(conv: Pick<Conversation, "messages" | "flow" | "status" | "handlerType">, now = new Date(), minHours = 48): boolean {
  if (conv.handlerType === "human" || conv.status === "resolvida") return true;
  const streak = unansweredAgentStreak(conv);
  if (streak >= 2) return true;
  if (streak < 1) return false;
  const last = [...conv.messages].reverse().find((m) => m.from === "agent" || m.from === "helena");
  const at = last?.at ?? conv.flow?.lastOutboundAt;
  if (!at) return true;
  return now.getTime() - new Date(at).getTime() < minHours * HOUR;
}

/**
 * Decide se a Closer / Time deve dar follow-up.
 * REGRA: só entra com VISUALIZAÇÃO (✓✓ azul) sem resposta.
 * Silêncio sem leitura NÃO dispara follow-up automático.
 */
export function evaluateFollowup(conv: Conversation, s: SalesFlowSettings, now = new Date()): FollowupDecision {
  const f = conv.flow;
  if (!s.enabled || !f) return { action: "none" };
  if (s.onlyAfterProspecting && f.origin !== "prospeccao") return { action: "none" };
  if (conv.handlerType === "human" || conv.status === "resolvida") return { action: "none" };
  if (!WATCHED.includes(f.state)) return { action: "none" };
  if (f.repliedAt && f.repliedAt >= f.lastOutboundAt) return { action: "none" };
  const last = conv.messages.at(-1);
  if (last?.from === "contact") return { action: "none" };
  if (f.state === "respondeu" || f.state === "reuniao_agendada" || f.state === "esfriou") return { action: "none" };
  if (unansweredAgentStreak(conv) >= 2 || f.closerAttempts >= Math.max(1, s.maxCloserAttempts)) {
    return { action: "esfriou" };
  }

  // Follow-up SOMENTE com visualização das mensagens.
  const read = !!f.readAt && f.readAt >= f.lastOutboundAt;
  if (!read) return { action: "none" };

  const reason: FollowupReason = "visualizou_sem_responder";
  const waitH = Math.max(1, s.readNoReplyHours || READ_CONTINUITY_HOURS);
  const due = nextBusinessTime(new Date(new Date(f.readAt!).getTime() + waitH * HOUR), s);
  if (now.getTime() < due.getTime()) return { action: "none", dueAt: due.toISOString(), reason };
  if (shouldHoldOutbound(conv, now, waitH)) {
    return { action: "none", dueAt: due.toISOString(), reason };
  }
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

/** Horários livres em horário comercial (manhã e tarde, vários dias). */
export function suggestSlots(meetings: Meeting[], ownerId: string, from: Date, s: SalesFlowSettings, count = 6): Date[] {
  const slots: Date[] = [];
  const hours = [10, 11, 14, 16].filter((h) => h >= s.businessStart && h < s.businessEnd);
  const start = new Date(from.getTime() + 2 * HOUR);
  for (let day = 0; day < 12 && slots.length < count; day++) {
    const d = new Date(start);
    d.setDate(start.getDate() + day);
    d.setMinutes(0, 0, 0);
    if (!isBusinessTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours[0] ?? 10, 0, 0, 0), { ...s, respectBusinessHours: true })) continue;
    for (const h of hours) {
      if (slots.length >= count) break;
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
      if (t.getTime() <= from.getTime()) continue;
      if (!isBusinessTime(t, { ...s, respectBusinessHours: true })) continue;
      if (h + s.meetingDurationMin / 60 > s.businessEnd) continue;
      if (hasConflict(meetings, ownerId, t.toISOString(), s.meetingDurationMin)) continue;
      slots.push(t);
    }
  }
  return slots;
}

export function formatSlotMenu(slots: Date[], now = new Date()) {
  if (!slots.length) return "Me diz um dia e hora que eu encaixo.";
  return slots.map((s, i) => `${i + 1}) ${slotLabel(s, now)}`).join("\n");
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
  const numbered: Array<[RegExp, number]> = [
    [/\b(sexto|6a|opcao 6|o 6|numero 6)\b/, 5],
    [/\b(quinto|5a|opcao 5|o 5|numero 5)\b/, 4],
    [/\b(quarto|4a|opcao 4|o 4|numero 4)\b/, 3],
    [/\b(terceiro|3a|opcao 3|o 3|numero 3)\b/, 2],
    [/\b(segundo|segunda opcao|2a|opcao 2|o 2|numero 2)\b/, 1],
    [/\b(primeiro|primeira|1a|opcao 1|o 1|numero 1)\b/, 0],
  ];
  for (const [re, idx] of numbered) {
    if (re.test(n) && slots[idx]) return slots[idx]!;
  }
  if (/\b(esse|pode ser|fechado|combinado|beleza|ok|sim|perfeito|bora|qualquer)\b/.test(n)) return slots[0]!;
  return null;
}

/** Mensagem da Closer pós-visualização: lê o contexto e segue a conversa (dono → IA → horário). */
export function closerFollowupText(opts: {
  contactName: string;
  closerName: string;
  company: string;
  attempt: number;
  reason: FollowupReason;
  slots: Date[];
  now?: Date;
  history?: { from: string; text: string }[];
  previewUrl?: string;
}) {
  const first = opts.contactName.replace(/^(Dra?\.)\s*/, "$1 ").split(" ").slice(0, /^Dra?\./.test(opts.contactName) ? 2 : 1).join(" ");
  const menu = formatSlotMenu(opts.slots, opts.now);
  // Preferência: texto natural baseado nas mensagens vistas.
  if (opts.reason === "visualizou_sem_responder") {
    const natural = buildReadFollowupText({
      contactName: opts.contactName,
      agentName: opts.closerName,
      company: opts.company,
      history: opts.history || [],
      previewUrl: opts.previewUrl,
    });
    if (opts.attempt <= 1) return `${natural}\n\nSe preferir, escolhe um horário de 10 min:\n${menu}`;
    return `${first}, última da minha parte. ${natural}\n${menu}`;
  }
  if (opts.attempt <= 1) {
    return `${first}, aqui é a ${opts.closerName} da ${opts.company}. Vi que você visualizou — você é o proprietário ou a pessoa responsável? Se for, me diz se tem IA operando na empresa e escolhe 10 min:\n${menu}`;
  }
  return `${first}, última da minha parte. Se for o dono ou a dona, me diz um destes horários. Se não, eu paro.\n${menu}`;
}

export function menuProposalFollowupText(contactName: string, offerName: string, price: number) {
  const first = contactName.trim().split(/\s+/)[0] || "Olá";
  return `Oi ${first}, conseguiu dar uma olhada na proposta que te enviei? Se não fez sentido para você, tudo bem — posso entender o que não encaixou. Também temos ${offerName} por R$ ${price.toFixed(2).replace(".", ",")}/mês, com link para compartilhar com seus clientes. Quer que eu te mostre uma demonstração? Se preferir não receber novos contatos, é só me avisar.`;
}

export const FLOW_STATE_LABEL: Record<FlowState, string> = {
  abordado: "Abordado",
  novo: "Aguardando disparo",
  visualizou: "Visualizou",
  respondeu: "Respondeu",
  aguardando_aprovacao: "Aguardando aprovação",
  closer: "Closer em ação",
  reuniao_agendada: "Reunião agendada",
  esfriou: "Esfriou",
};

export const FOLLOWUP_REASON_LABEL: Record<FollowupReason, string> = {
  sem_resposta: "não respondeu",
  visualizou_sem_responder: "visualizou e não respondeu",
};
