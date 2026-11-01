import type { Contact, Conversation, DB, SalesFlowSettings } from "@/lib/types";
import { isBusinessTime, nextBusinessTime, shouldHoldOutbound } from "@/lib/helena/sales-flow";
import { dailyLimitFor, mustSubscribe, prospectsUsedToday } from "@/lib/saas";

const MIN_GAP_MS = 35_000;
const HOUR_CAP = 20;

export function isOptedOut(contact?: Pick<Contact, "tags" | "consent"> | null) {
  if (!contact) return false;
  if (contact.consent === false) return true;
  return (contact.tags ?? []).some((t) => /opt-?out|bloquear|nao mexer|não mexer/i.test(t));
}

export function lastWhatsAppOutboundAt(db: DB): number {
  const fromFlow = db.conversations
    .map((c) => (c.flow?.lastOutboundAt ? new Date(c.flow.lastOutboundAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const fromExec = db.executions
    .filter((e) => e.result === "sucesso" && /messages\.send|evolution\.sendText/.test(e.action))
    .map((e) => new Date(e.at).getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  return Math.max(fromFlow, fromExec);
}

export function sentLastHour(db: DB, now = Date.now()) {
  return db.executions.filter(
    (e) =>
      e.result === "sucesso" &&
      /messages\.send|evolution\.sendText/.test(e.action) &&
      now - new Date(e.at).getTime() < 3_600_000,
  ).length;
}

export function evaluateOutbound(opts: {
  db: DB;
  conv?: Conversation;
  contact?: Contact | null;
  now?: Date;
}): { ok: true } | { ok: false; waitMs?: number; message: string } {
  const now = opts.now ?? new Date();
  const user = opts.db.users.find((u) => u.id === opts.db.currentUserId);
  const isTest = typeof process !== "undefined" && Boolean(process.env?.VITEST);
  if (mustSubscribe(user)) {
    return { ok: false, message: "Trial acabou. Assine Impulso ou Máquina para o WhatsApp voltar a disparar." };
  }
  if (isOptedOut(opts.contact)) {
    return { ok: false, message: "Este número pediu para não ser contatado (opt-out / sem consentimento)." };
  }
  const flow: SalesFlowSettings = opts.db.salesFlow ?? {
    enabled: true,
    sharedConnectionId: "",
    teamUserIds: [],
    onlyAfterProspecting: true,
    noReplyHours: 48,
    readNoReplyHours: 24,
    maxCloserAttempts: 1,
    closerAgentId: "",
    respectBusinessHours: true,
    businessStart: 8,
    businessEnd: 18,
    meetingDurationMin: 30,
    autoBookMeetings: true,
  };
  if (!isTest && !isBusinessTime(now, flow)) {
    const next = nextBusinessTime(now, flow);
    return {
      ok: false,
      waitMs: next.getTime() - now.getTime(),
      message: `Fora do horário comercial (seg–sex ${flow.businessStart}h–${flow.businessEnd}h). Próximo disparo ${next.toLocaleString("pt-BR")}.`,
    };
  }
  const used = prospectsUsedToday(user, now);
  const cap = dailyLimitFor(user);
  if (used >= cap) {
    return { ok: false, message: `Limite diário de ${cap} abordagens atingido.` };
  }
  if (!isTest && sentLastHour(opts.db, now.getTime()) >= HOUR_CAP) {
    return { ok: false, waitMs: 3_600_000, message: "Teto antiban: no máximo 20 disparos por hora." };
  }
  const gap = now.getTime() - lastWhatsAppOutboundAt(opts.db);
  if (!isTest && gap >= 0 && gap < MIN_GAP_MS) {
    const waitMs = MIN_GAP_MS - gap;
    return { ok: false, waitMs, message: `Antiban: espere ${Math.ceil(waitMs / 1000)}s entre um WhatsApp e outro.` };
  }
  if (opts.conv && shouldHoldOutbound(opts.conv, now, 48)) {
    return { ok: false, message: "Este número já foi abordado. Esperando resposta para não insistir." };
  }
  return { ok: true };
}
