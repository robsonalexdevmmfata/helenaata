// Revenue-goal math used by Helena ("precisamos faturar R$ 15.000 esta semana").
// Pure functions so they can be tested and later moved to the real backend.
import { normalize } from "@/lib/format";

export const REVENUE_DEFAULTS = {
  ticket: 100, // site/cardápio oficial R$ 100/mês
  closeRate: 0.25, // reuniões -> vendas (Closer)
  meetingRate: 0.1, // leads abordados -> reuniões (SDRs)
};

export interface RevenuePlan {
  goal: number;
  ticket: number;
  closeRate: number;
  meetingRate: number;
  sales: number;
  meetings: number;
  leads: number;
  deadline: string;
}

/** Extracts the BRL amount from a revenue-goal command, or null when the text is not one. */
export function parseRevenueGoal(text: string): number | null {
  const n = normalize(text);
  if (!/(faturar|faturamento|faturem|receita|bater\s+r\$|vender\s+r\$|fechar\s+(?:r\$\s*)?\d|meta\s+(?:de\s+)?(?:r\$\s*)?\d|projetos?\s+fechad|fazer\s+(?:r\$\s*)?\d|preciso\s+(?:fazer|faturar|bater)|campanha\s+(?:de\s+)?(?:r\$\s*)?\d|3\s*mil\s*(reais)?\s*(no|por|\/)?\s*mes)/.test(n)) {
    return null;
  }
  const m =
    n.match(/(?:fechar|meta|faturar|bater|vender|fazer)\s*(?:de\s*)?(?:r\$\s*)?([\d.]+(?:,\d+)?)\s*(mil|k)?/)
    ?? n.match(/r\$\s*([\d.]+(?:,\d+)?)\s*(mil|k)?/)
    ?? n.match(/([\d.]+(?:,\d+)?)\s*(mil|k)\b/);
  if (!m) return null;
  let value = Number(m[1].replace(/\./g, "").replace(",", "."));
  if (m[2]) value *= 1000;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseDeadline(text: string): string {
  const n = normalize(text);
  const day = n.match(/(segunda|terca|quarta|quinta|sexta|sabado|domingo)(-feira)?/);
  if (day) return `até ${day[1] === "terca" ? "terça" : day[1] === "sabado" ? "sábado" : day[1]}${day[2] ? "-feira" : ""}`;
  if (/esta semana|essa semana|nesta semana/.test(n)) return "esta semana";
  if (/este mes|esse mes|neste mes/.test(n)) return "este mês";
  if (/hoje/.test(n)) return "hoje";
  return "esta semana";
}

export function computeRevenuePlan(goal: number, opts: Partial<typeof REVENUE_DEFAULTS> = {}, deadline = "esta semana"): RevenuePlan {
  const { ticket, closeRate, meetingRate } = { ...REVENUE_DEFAULTS, ...opts };
  const sales = Math.ceil(goal / ticket);
  const meetings = Math.ceil(sales / closeRate);
  const leads = Math.ceil(meetings / meetingRate);
  return { goal, ticket, closeRate, meetingRate, sales, meetings, leads, deadline };
}
