import type {
  CommercialProposal, Contact, DailyReport, DB, RadarSchedule, RpaJob, RpaJobKind, User,
} from "@/lib/types";
import { currentUser, getDB, nowISO, uid, update } from "@/lib/store";
import { isOptedOut } from "@/lib/whatsapp/antiban";
import { nextBusinessTime } from "@/lib/helena/sales-flow";
import { scheduleCyclePush } from "@/lib/persist/cycle";
import { diagnoseLead } from "@/lib/helena/diagnose";

const MAX_ATTEMPTS = 3;

function isTest() {
  try {
    return Boolean(import.meta.env?.MODE === "test" || import.meta.env?.VITEST);
  } catch {
    return typeof process !== "undefined" && Boolean(process.env?.VITEST);
  }
}

function backoffMs(attempts: number) {
  return Math.min(60 * 60_000, 2 ** Math.max(0, attempts) * 60_000);
}

export function ensureRpaCollections(db: DB) {
  if (!Array.isArray(db.rpaJobs)) db.rpaJobs = [];
  if (!Array.isArray(db.radarSchedules)) db.radarSchedules = [];
  if (!Array.isArray(db.commercialProposals)) db.commercialProposals = [];
  if (!Array.isArray(db.commercialDossiers)) db.commercialDossiers = [];
  if (!Array.isArray(db.commercialDecisions)) db.commercialDecisions = [];
  if (!Array.isArray(db.dailyReports)) db.dailyReports = [];
}

export function enqueueRpa(input: {
  kind: RpaJobKind;
  contactId?: string;
  payload?: Record<string, unknown>;
  runAt?: string;
  idempotencyKey: string;
  maxAttempts?: number;
}): RpaJob | null {
  const db = getDB();
  ensureRpaCollections(db);
  const existing = db.rpaJobs.find((j) => j.idempotencyKey === input.idempotencyKey);
  if (existing) return existing;
  const job: RpaJob = {
    id: uid("rpa_"),
    organizationId: db.organization.id,
    kind: input.kind,
    status: "queued",
    contactId: input.contactId,
    payload: input.payload || {},
    runAt: input.runAt || nowISO(),
    attempts: 0,
    maxAttempts: input.maxAttempts ?? MAX_ATTEMPTS,
    idempotencyKey: input.idempotencyKey,
    createdAt: nowISO(),
  };
  update((d) => {
    ensureRpaCollections(d);
    if (!d.rpaJobs.some((j) => j.idempotencyKey === job.idempotencyKey)) d.rpaJobs.unshift(job);
  });
  scheduleCyclePush();
  return getDB().rpaJobs.find((j) => j.id === job.id) || job;
}

export function retryRpaJob(id: string) {
  const job = getDB().rpaJobs?.find((j) => j.id === id);
  if (!job) return { ok: false as const, message: "tarefa não encontrada" };
  if (job.status !== "failed" && job.status !== "skipped") return { ok: false as const, message: "só reprocessa falha ou pulada" };
  if (job.attempts >= job.maxAttempts) return { ok: false as const, message: `limite de ${job.maxAttempts} tentativas` };
  update((d) => {
    const j = d.rpaJobs.find((x) => x.id === id);
    if (!j) return;
    j.status = "queued";
    j.error = undefined;
    j.runAt = nowISO();
  });
  scheduleCyclePush();
  return { ok: true as const, message: "Tarefa reenfileirada." };
}

export function markJob(id: string, status: RpaJob["status"], error?: string, durationMs?: number) {
  update((d) => {
    ensureRpaCollections(d);
    const j = d.rpaJobs.find((x) => x.id === id);
    if (!j) return;
    j.status = status;
    j.error = error;
    j.durationMs = durationMs;
    j.finishedAt = nowISO();
    if (status === "failed" && j.attempts < j.maxAttempts) {
      j.status = "queued";
      j.runAt = new Date(Date.now() + backoffMs(j.attempts)).toISOString();
    }
  });
  scheduleCyclePush();
}

export function rpaMonitor(db: DB) {
  ensureRpaCollections(db);
  const jobs = db.rpaJobs;
  const queued = jobs.filter((j) => j.status === "queued");
  const running = jobs.filter((j) => j.status === "running");
  const failed = jobs.filter((j) => j.status === "failed");
  const sent = jobs.filter((j) => j.status === "sent");
  const next = queued.slice().sort((a, b) => +new Date(a.runAt) - +new Date(b.runAt))[0];
  const last = jobs.filter((j) => j.finishedAt).sort((a, b) => +new Date(b.finishedAt!) - +new Date(a.finishedAt!))[0];
  const durations = sent.map((j) => j.durationMs || 0).filter(Boolean);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  return {
    queued: queued.length,
    running: running.length,
    failed: failed.length,
    sent: sent.length,
    nextAt: next?.runAt || "",
    lastAt: last?.finishedAt || "",
    avgMs: avg,
    alert: failed.length > 0 ? `${failed.length} tarefa(s) com falha` : running.length ? "Worker ocupado" : "Fila estável",
  };
}

export function followupDueAt(hours = 24) {
  const db = getDB();
  const flow = db.salesFlow || { respectBusinessHours: true, businessStart: 9, businessEnd: 18 };
  return nextBusinessTime(new Date(Date.now() + hours * 3600_000), flow).toISOString();
}

export function scheduleFollowup(contact: Contact, kind: "preco_alto" | "sem_resposta" | "pedido_retorno" | "objecao", fact: string) {
  if (isOptedOut(contact)) return null;
  const text =
    kind === "preco_alto"
      ? `${contact.name}, 1 cliente novo no mês que hoje vai pro concorrente no Google já paga o projeto. Sem pressão: 10 minutos e você decide.`
      : kind === "pedido_retorno"
        ? `${contact.name}, como combinamos: ainda faz sentido uns 10 minutos pra eu te mostrar a prévia?`
        : `${contact.name}, só passando: a prévia continua no ar se quiser ver com calma. Prefere terça 10h ou quinta 16h?`;
  return enqueueRpa({
    kind: "followup",
    contactId: contact.id,
    idempotencyKey: `followup:${kind}:${contact.id}`,
    runAt: followupDueAt(kind === "sem_resposta" ? 48 : 22),
    payload: { kind, fact, text, phone: contact.phone },
  });
}

export function buildDailyStats(db: DB) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const t = day.getTime();
  const found = db.contacts.filter((c) => new Date(c.createdAt).getTime() >= t).length;
  const dx = db.executions.filter((e) => e.action === "leads.diagnose" && e.result === "sucesso" && new Date(e.at).getTime() >= t).length;
  const previews = (db.sitePreviews || []).filter((p) => new Date(p.createdAt).getTime() >= t).length;
  const msgs = db.executions.filter((e) => e.result === "sucesso" && /messages\.send|evolution\.sendText/.test(e.action) && new Date(e.at).getTime() >= t).length;
  const replies = db.conversations.filter((c) => c.messages.some((m) => m.from === "contact" && new Date(m.at).getTime() >= t)).length;
  const meetings = (db.calendarEvents || []).filter((e) => e.status !== "cancelada" && new Date(e.createdAt || e.dataHora).getTime() >= t).length;
  ensureRpaCollections(db);
  const failed = db.rpaJobs.filter((j) => j.status === "failed").length;
  const pending = db.rpaJobs.filter((j) => j.status === "queued").length;
  return { found, diagnoses: dx, previews, messages: msgs, replies, meetings, failed, pending };
}

export function writeDailyReport(): DailyReport {
  const db = getDB();
  const day = new Date().toISOString().slice(0, 10);
  const existing = (db.dailyReports || []).find((r) => r.day === day);
  if (existing) return existing;
  const stats = buildDailyStats(db);
  const body =
    `Relatório Helena ${day}\n` +
    `${stats.found} leads · ${stats.diagnoses} diagnósticos · ${stats.previews} prévias\n` +
    `${stats.messages} mensagens · ${stats.replies} respostas · ${stats.meetings} reuniões\n` +
    `${stats.failed} falhas RPA · ${stats.pending} na fila.`;
  const row: DailyReport = {
    id: uid("rep_"),
    organizationId: db.organization.id,
    day,
    body,
    stats,
    createdAt: nowISO(),
  };
  update((d) => {
    ensureRpaCollections(d);
    if (!d.dailyReports.some((r) => r.day === day)) d.dailyReports.unshift(row);
  });
  scheduleCyclePush();
  return getDB().dailyReports.find((r) => r.day === day) || row;
}

export function draftProposal(contact: Contact): CommercialProposal {
  const db = getDB();
  const company = db.companies.find((c) => c.id === contact.companyId);
  const dossier = (db.commercialDossiers || []).find((d) => d.contactId === contact.id);
  const dx = diagnoseLead({
    name: company?.name || contact.name,
    segment: company?.segment,
    city: company?.city,
    website: company?.website,
    tags: contact.tags,
    hasWhatsApp: Boolean(contact.phone),
  });
  const offer = db.serviceOffers?.find((o) => /site/i.test(o.name)) || db.serviceOffers?.[0];
  const amount = dossier?.roi.offerPrice || offer?.price || 4900;
  const scope = dossier?.offer || dx.recommend_offer;
  const benefits = dossier?.approach || dx.recommend_pitch;
  const existing = (db.commercialProposals || []).find((p) => p.contactId === contact.id && p.status === "rascunho");
  if (existing) return existing;
  const version = ((db.commercialProposals || []).filter((p) => p.contactId === contact.id).length || 0) + 1;
  const row: CommercialProposal = {
    id: uid("pr_"),
    organizationId: db.organization.id,
    contactId: contact.id,
    title: `Proposta · ${company?.name || contact.name}`,
    scope,
    offer: scope,
    benefits,
    amount,
    status: "rascunho",
    version,
    createdAt: nowISO(),
  };
  update((d) => {
    ensureRpaCollections(d);
    d.commercialProposals.unshift(row);
  });
  scheduleCyclePush();
  return row;
}

export function upsertRadarSchedule(input: { segment: string; city: string; hour?: number; limit?: number }) {
  const db = getDB();
  let saved: RadarSchedule | undefined;
  update((d) => {
    ensureRpaCollections(d);
    const cur = d.radarSchedules[0];
    if (cur) {
      cur.segment = input.segment;
      cur.city = input.city;
      cur.hour = input.hour ?? cur.hour;
      cur.limit = input.limit ?? cur.limit;
      cur.active = true;
      saved = cur;
    } else {
      saved = {
        id: uid("rad_"),
        organizationId: d.organization.id,
        segment: input.segment,
        city: input.city,
        hour: input.hour ?? 9,
        limit: input.limit ?? 8,
        active: true,
      };
      d.radarSchedules.unshift(saved);
    }
  });
  return saved!;
}

function dueJobs(db: DB) {
  const now = Date.now();
  return db.rpaJobs
    .filter((j) => j.status === "queued" && new Date(j.runAt).getTime() <= now)
    .sort((a, b) => +new Date(a.runAt) - +new Date(b.runAt));
}

/** Processa no máximo 1 tarefa devolvendo o que o engine deve executar. */
export function claimNextJob(): RpaJob | null {
  const db = getDB();
  ensureRpaCollections(db);
  const job = dueJobs(db)[0];
  if (!job) return null;
  update((d) => {
    const j = d.rpaJobs.find((x) => x.id === job.id);
    if (!j || j.status !== "queued") return;
    j.status = "running";
    j.attempts += 1;
  });
  return getDB().rpaJobs.find((j) => j.id === job.id) || null;
}

export function maybeEnqueueRadar() {
  const db = getDB();
  ensureRpaCollections(db);
  const sch = db.radarSchedules.find((s) => s.active);
  if (!sch) return;
  const now = new Date();
  if (now.getHours() < sch.hour && !isTest()) return;
  const day = now.toISOString().slice(0, 10);
  if (sch.lastRunAt && sch.lastRunAt.slice(0, 10) === day) return;
  enqueueRpa({
    kind: "scan_maps",
    idempotencyKey: `radar:${db.organization.id}:${day}`,
    payload: { segment: sch.segment, city: sch.city, limit: sch.limit },
  });
  update((d) => {
    const s = d.radarSchedules.find((x) => x.id === sch.id);
    if (s) s.lastRunAt = nowISO();
  });
}

/** Follow-up só com visualização (✓✓ azul) sem resposta — não chase silêncio cego. */
export function maybeEnqueueSilenceFollowups() {
  const db = getDB();
  const waitMs = Math.max(1, db.salesFlow?.readNoReplyHours || 2) * 3600_000;
  const now = Date.now();
  for (const conv of db.conversations) {
    const contact = db.contacts.find((c) => c.id === conv.contactId);
    if (!contact || isOptedOut(contact)) continue;
    const f = conv.flow;
    if (!f?.readAt || !f.lastOutboundAt) continue;
    if (f.readAt < f.lastOutboundAt) continue;
    if (f.repliedAt && f.repliedAt >= f.lastOutboundAt) continue;
    if (conv.messages.some((m) => m.from === "contact" && m.at >= f.lastOutboundAt)) continue;
    if (now - new Date(f.readAt).getTime() < waitMs) continue;
    scheduleFollowup(contact, "sem_resposta", "visualizou_sem_responder · continuidade pós ✓✓ azul");
  }
}

export function maybeEnqueueDailyReport(user: User) {
  const hour = new Date().getHours();
  if (!isTest() && hour < 18) return;
  const day = new Date().toISOString().slice(0, 10);
  enqueueRpa({
    kind: "daily_report",
    idempotencyKey: `daily:${user.organizationId}:${day}`,
    payload: { phone: user.phone },
  });
}
