import { useSyncExternalStore } from "react";
import type { DB } from "./types";
import { createSeed, liveMapsAutomations } from "./seed";
import { applyCommercialAgentPrompts, liveServiceOffers } from "./catalog";
import { TOOL_REGISTRY, withCalendarTools } from "./helena/registry";
import { AGENCY_WHATSAPP } from "./evolution/evolutionapi";

// Mock data layer. All reads/writes go through this store so it can be swapped
// for HTTP calls to a real PostgreSQL-backed API without touching the screens.
const KEY = "helena-db-v2";

let seedCache: DB | null = null;
const seed = () => (seedCache ??= createSeed());

let state: DB | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): DB {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (typeof parsed.version === "number" && parsed.version >= 1 && parsed.version <= 6) {
        const db = hydrate(parsed);
        try {
          window.localStorage.setItem(KEY, JSON.stringify(db));
        } catch {
          /* storage full */
        }
        return db;
      }
    }
  } catch {
    /* ignore corrupted storage */
  }
  return seed();
}

/** Completa campos novos em bases persistidas no localStorage. */
function hydrate(db: DB): DB {
  if (!Array.isArray(db.calendarEvents)) db.calendarEvents = [];
  if (!Array.isArray(db.toolSettings)) db.toolSettings = [];
  for (const t of TOOL_REGISTRY) {
    if (!db.toolSettings.some((x) => x.name === t.name)) {
      db.toolSettings.push({ name: t.name, enabled: true, risk: t.defaultRisk });
    }
  }
  db.agents?.forEach((a) => {
    a.tools = withCalendarTools(a.tools ?? []);
    if (!a.permissions.includes("crm.edit")) a.permissions.push("crm.edit");
    if (!a.permissions.includes("calendar.edit")) a.permissions.push("calendar.edit");
    a.metrics = { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 };
  });
  db.teams?.forEach((t) => {
    t.metrics = { leads: 0, meetings: 0, conversions: 0 };
  });
  db.connections = (db.connections ?? []).filter((c) => c.id === AGENCY_WHATSAPP.id || /info tech/i.test(c.name));
  if (!db.connections.length) {
    db.connections = [
      {
        id: AGENCY_WHATSAPP.id,
        organizationId: db.organization.id,
        name: AGENCY_WHATSAPP.name,
        phone: AGENCY_WHATSAPP.phone,
        type: "cloud_api",
        status: "online",
        queue: 0,
        sentToday: 0,
        dailyLimit: 1000,
        lastSyncAt: new Date().toISOString(),
      },
    ];
  }
  db.users?.forEach((u) => {
    if (u.id === "u1" || /leticia/i.test(u.name) || /leticia/i.test(u.email)) {
      u.name = "Robson Alex";
      u.email = "robson@infotech.com.br";
      u.title = "CEO";
    }
  });
  if ((db.version ?? 0) < 5) {
    const demo = (id: string, prefix: string) => new RegExp(`^${prefix}\\d+$`).test(id);
    db.users = (db.users ?? []).filter((u) => u.id === "u1");
    db.currentUserId = "u1";
    const owner = db.users.find((u) => u.id === "u1");
    if (owner) {
      owner.goal = 15_000;
      owner.achieved = 0;
      owner.lastSeen = new Date().toISOString();
    }
    db.invites = [];
    db.contacts = (db.contacts ?? []).filter((c) => !demo(c.id, "p"));
    db.companies = (db.companies ?? []).filter((c) => !demo(c.id, "c"));
    const keepContact = new Set(db.contacts.map((c) => c.id));
    const keepCompany = new Set(db.companies.map((c) => c.id));
    db.deals = (db.deals ?? []).filter((d) => !demo(d.id, "d") && keepContact.has(d.contactId) && (!d.companyId || keepCompany.has(d.companyId)));
    db.tasks = (db.tasks ?? []).filter((t) => !/^tk\d+$/.test(t.id));
    db.conversations = (db.conversations ?? []).filter((c) => !/^cv\d+$/.test(c.id) && keepContact.has(c.contactId));
    db.activities = (db.activities ?? []).filter((a) => keepContact.has(a.contactId));
    db.lists = (db.lists ?? []).filter((l) => !demo(l.id, "l"));
    db.campaigns = (db.campaigns ?? []).filter((c) => !demo(c.id, "cp"));
    db.operations = [];
    db.approvals = [];
    db.knowledge = [];
    db.aiUsage = [];
    db.lgpdRequests = [];
    db.webhookLogs = [];
    db.executions = (db.executions ?? []).filter((e) => !/^ex\d+$/.test(e.id));
    db.calendarEvents = (db.calendarEvents ?? []).filter((e) => !/^ev\d+$/.test(e.id) && keepContact.has(e.leadId));
    db.memories = [
      { id: "mem_produtos", organizationId: db.organization.id, type: "permanente", title: "Produtos e serviços", content: "Info Tech Ltda: sites institucionais (a partir de R$ 4.900), landing pages (R$ 1.900), gestão de tráfego (R$ 1.800/mês), automação de WhatsApp (R$ 3.500).", source: "Robson Alex", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "mem_icp", organizationId: db.organization.id, type: "permanente", title: "ICP principal", content: "Empresas B2B no Brasil sem site (ou site fraco) e com WhatsApp ativo. Nicho definido na varredura.", source: "Robson Alex", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "mem_tom", organizationId: db.organization.id, type: "permanente", title: "Tom de comunicação", content: "Cordial, direto e consultivo. Sem gírias. Abordagem no WhatsApp com a personalidade do Robson Alex.", source: "Robson Alex", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "mem_horario", organizationId: db.organization.id, type: "permanente", title: "Horário comercial", content: "Prospecção Seg–Sex, 09:00–18:00 (America/Sao_Paulo). Não disparar aos domingos.", source: "Robson Alex", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "mem_desconto", organizationId: db.organization.id, type: "permanente", title: "Política de desconto", content: "Desconto máximo de 10% sem aprovação do Robson. Acima disso, encaminhar para o CEO.", source: "Robson Alex", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    db.automations = liveMapsAutomations(db.organization.id);
    db.agents?.forEach((a) => {
      a.currentTask = undefined;
      a.knowledgeIds = [];
      a.status = a.status === "pausado" ? "pausado" : "aguardando";
    });
  }
  if (!Array.isArray(db.serviceOffers)) db.serviceOffers = [];
  if ((db.version ?? 0) < 6) {
    db.serviceOffers = liveServiceOffers(db.organization.id);
    applyCommercialAgentPrompts(db.agents ?? []);
    const prod = db.memories?.find((m) => m.id === "mem_produtos");
    if (prod) {
      prod.content = "Tabela viva em Prospecção → Orçamentos. Os agentes só podem cotar o que está ativo nessa lista.";
      prod.updatedAt = new Date().toISOString();
    }
  }
  db.version = 6;
  if (db.automations?.some((a) => /facebook/i.test(a.name) || /^au\d+$/.test(a.id))) {
    db.automations = liveMapsAutomations(db.organization.id);
  }
  const roles = db.rolePermissions;
  if (roles) {
    (Object.keys(roles) as Array<keyof typeof roles>).forEach((role) => {
      if (role === "viewer") return;
      if (!roles[role].includes("calendar.edit")) roles[role].push("calendar.edit");
    });
  }
  return db;
}

export function getDB(): DB {
  if (!state) state = load();
  return state;
}

function persist() {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full: keep in memory */
    }
  }, 250);
}

export function update(fn: (draft: DB) => void) {
  const next = structuredClone(getDB());
  fn(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function resetDB() {
  state = createSeed();
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, seed);
}

export function uid(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO() {
  return new Date().toISOString();
}

/** Conta execução real de um fluxo Maps (lead criado, resposta, reunião). */
export function bumpAutomation(d: DB, trigger: string, count = 1) {
  const at = nowISO();
  d.automations.forEach((a) => {
    if (!a.active || a.trigger !== trigger) return;
    a.runs += count;
    a.lastRunAt = at;
  });
}

/** Resolve an owner id (user or agent) to a display name. */
export function ownerName(db: DB, id?: string) {
  if (!id) return "—";
  if (id === "helena") return "Helena";
  return db.users.find((u) => u.id === id)?.name ?? db.agents.find((a) => a.id === id)?.name ?? "—";
}

export function currentUser(db: DB) {
  return db.users.find((u) => u.id === db.currentUserId)!;
}

export function can(db: DB, permission: string) {
  const user = currentUser(db);
  return db.rolePermissions[user.role]?.includes(permission) ?? false;
}

/** Tiny generic store for UI-only state (not persisted). */
export function createUiStore<T>(initial: T) {
  let s = initial;
  const ls = new Set<() => void>();
  return {
    get: () => s,
    set: (patch: Partial<T>) => {
      s = { ...s, ...patch };
      ls.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          ls.add(l);
          return () => ls.delete(l);
        },
        () => s,
        () => initial,
      ),
  };
}
