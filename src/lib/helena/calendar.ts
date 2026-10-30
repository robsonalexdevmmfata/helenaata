/**
 * Agenda compartilhada + script comercial da Info Tech.
 * Helena orquestra; SDR/Closer usam estas tools e o script nas abordagens.
 */

export const ROBSON_OPENING_SCRIPT =
  "Olá! Sou o Robson Alex, da Info Tech. Vi vocês no mapa e notei que ainda não têm site na região. Você é o proprietário ou a proprietária do estabelecimento?";

/** Tools injetadas no prompt/contexto de todo agente de IA. */
export const AGENT_CALENDAR_TOOLS = [
  "calendar.create_event",
  "calendar.agendar_reuniao",
  "calendar.list_events",
  "calendar.update_event",
] as const;

export const CALENDAR_TOOL_PROMPT = `Agenda compartilhada (leitura e escrita obrigatórias):
- Use agendarReuniao(leadId, dataHora, resumo) assim que o cliente fechar um horário no WhatsApp.
- Equivalente interno: calendar.create_event / calendar.agendar_reuniao.
- Consulte calendar.list_events antes de marcar para evitar conflito.
- Atualize o status com calendar.update_event (agendada, confirmada, realizada, cancelada, no_show).`;

export function buildRobsonOpening(contactName?: string, companyName?: string) {
  const who = contactName ? `Olá ${contactName}!` : "Olá!";
  const biz = companyName ? ` a ${companyName}` : " vocês";
  return `${who} Sou o Robson Alex, da Info Tech. Vi${biz} no mapa e notei que ainda não têm site na região. Você é o proprietário ou a proprietária do estabelecimento?`;
}

export interface ParsedMeeting {
  dataHora: string;
  resumo: string;
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6,
};

function atHour(base: Date, hour: number, minute: number) {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextWeekday(from: Date, weekday: number) {
  const d = new Date(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Interpreta horário fechado em mensagem de WhatsApp (pt-BR). */
export function extractMeetingFromText(text: string, now = new Date()): ParsedMeeting | null {
  const n = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const timeMatch = n.match(/\b(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|hrs|horas)?\b/);
  if (!timeMatch) return null;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? 0);
  if (hour > 23 || minute > 59) return null;

  const looksLikeSchedule =
    /amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|as\s+\d|às\s+\d|reuniao|horario|pode ser|fechado|marcar|agendar/.test(n);
  if (!looksLikeSchedule) return null;

  let day = new Date(now);
  if (/\bamanha\b/.test(n)) {
    day.setDate(day.getDate() + 1);
  } else if (/\bhoje\b/.test(n)) {
    /* keep today */
  } else {
    const wd = Object.keys(WEEKDAYS).find((k) => n.includes(k));
    if (wd) day = nextWeekday(now, WEEKDAYS[wd]!);
    else day.setDate(day.getDate() + 1);
  }

  const when = atHour(day, hour, minute);
  if (when.getTime() <= now.getTime() && /\bhoje\b/.test(n)) {
    when.setDate(when.getDate() + 1);
  }

  return {
    dataHora: when.toISOString(),
    resumo: `Reunião 10 min combinada no WhatsApp para ${when.toLocaleString("pt-BR")}`,
  };
}
