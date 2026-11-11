import { useSyncExternalStore } from "react";
import type { DB } from "./types";
import { applyDevTeamGate, createCustomerSeed, createSeed, defaultSalesFlow, liveMapsAutomations, ensureSaasUsers, PLATFORM_ORG } from "./seed";
import { ensureCommercialStageOrder, promoteNoSiteDealsToQualified } from "@/lib/crm/pipelineStages";
import type { User } from "./types";
import { applyCommercialAgentPrompts, applyHumanTeam, liveServiceOffers } from "./catalog";
import { TOOL_REGISTRY, withCalendarTools } from "./helena/registry";
import { AGENCY_WHATSAPP } from "./evolution/evolutionapi";
import { hashPw, sanitizeDb, sanitizeUser } from "@/lib/security/secrets";
import { persistHelenaChat, restoreHelenaChat } from "@/lib/persist/helenaChat";

// Mock data layer. All reads/writes go through this store so it can be swapped
// for HTTP calls to a real PostgreSQL-backed API without touching the screens.
const KEY = "helena-db-v2";
const ACCOUNTS_KEY = "helena-accounts-v1";
const SESSION_KEY = "helena-session";

let seedCache: DB | null = null;
const seed = () => (seedCache ??= createSeed());

let state: DB | null = null;
let persistKey = KEY;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function wsKey(orgId: string) {
  return `helena-ws-${orgId}`;
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full */
  }
}

function bootSessionUserId() {
  const parsed = readJson<{ userId?: string }>(SESSION_KEY);
  return parsed?.userId || "";
}

function isPlatformUser(user?: User | null) {
  if (!user) return false;
  if (user.kind === "platform") return true;
  return user.role === "owner" && user.id === "u1";
}

export function listAccounts(): User[] {
  const stored = readJson<{ users: User[] }>(ACCOUNTS_KEY);
  const fromDisk = stored?.users ?? [];
  const fromState = state?.users ?? [];
  const fromPlatform = persistKey === KEY ? fromState : (readJson<DB>(KEY)?.users ?? []);
  const map = new Map<string, User>();
  for (const u of [...fromPlatform, ...fromDisk, ...fromState, ...seed().users]) {
    if (u?.id) map.set(u.id, u);
  }
  return [...map.values()];
}

function saveAccounts(users: User[]) {
  const map = new Map<string, User>();
  for (const u of [...(readJson<{ users: User[] }>(ACCOUNTS_KEY)?.users ?? []), ...users]) {
    if (u?.id) map.set(u.id, u);
  }
  writeJson(ACCOUNTS_KEY, { users: [...map.values()] });
}

export function upsertAccount(user: User) {
  const users = listAccounts();
  const i = users.findIndex((u) => u.id === user.id);
  if (i >= 0) users[i] = { ...users[i], ...user };
  else users.push(user);
  saveAccounts(users);
}

function parseDb(raw: DB | null): DB | null {
  // Aceita versões futuras — o teto antigo (>12) APAGAVA o workspace no refresh
  // porque hydrate sobe pra 13 e no próximo load parseDb devolvia null → seed vazio.
  if (!raw || typeof raw.version !== "number" || raw.version < 1 || raw.version > 99) return null;
  return hydrate(raw);
}

function loadPlatform(): DB {
  persistKey = KEY;
  const parsed = parseDb(readJson<DB>(KEY));
  if (parsed) {
    writeJson(KEY, parsed);
    saveAccounts(parsed.users);
    return parsed;
  }
  const db = seed();
  saveAccounts(db.users);
  return db;
}

function loadCustomerWorkspace(user: User): DB {
  persistKey = wsKey(user.organizationId);
  const parsed = parseDb(readJson<DB>(persistKey));
  if (parsed) {
    parsed.currentUserId = user.id;
    if (!parsed.users.some((u) => u.id === user.id)) parsed.users.unshift({ ...user, role: "owner" });
    return parsed;
  }
  return createCustomerSeed(user);
}

/** Troca o banco ativo: admin vê a operação Info Tech; cliente vê workspace vazio até gerar dado real. */
export function activateWorkspaceForUser(userId: string) {
  const user = listAccounts().find((u) => u.id === userId);
  if (!user) return;
  if (isPlatformUser(user)) {
    state = loadPlatform();
    state.currentUserId = userId;
  } else {
    if (!user.organizationId || user.organizationId === PLATFORM_ORG) {
      user.organizationId = user.id === "u_demo" ? "org_demo" : `org_${user.id.replace(/^u_/, "")}`;
      upsertAccount(user);
    }
    state = loadCustomerWorkspace(user);
    state.currentUserId = userId;
    applyDevTeamGate(state, user.planId, user.kind);
  }
  if (state) {
    restoreHelenaChat(state);
    persistHelenaChat(state);
  }
  persistNow();
  listeners.forEach((l) => l());
}

function load(): DB {
  if (typeof window === "undefined") return seed();
  const uid = bootSessionUserId();
  if (uid) {
    persistKey = KEY;
    state = loadPlatform();
    const user = listAccounts().find((u) => u.id === uid);
    if (user && !isPlatformUser(user)) {
      activateWorkspaceForUser(uid);
      return state!;
    }
    if (state) state.currentUserId = uid;
    return state;
  }
  return loadPlatform();
}

/** Completa campos novos em bases persistidas no localStorage. */
function hydrate(db: DB): DB {
  if (!Array.isArray(db.calendarEvents)) db.calendarEvents = [];
  if (!Array.isArray(db.meetings)) db.meetings = [];
  if (!db.salesFlow) db.salesFlow = defaultSalesFlow();
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
    // NÃO zerar métricas no refresh — isso apagava o progresso e ainda ia pro Supabase.
    if (!a.metrics || typeof a.metrics !== "object") {
      a.metrics = { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 };
    } else {
      a.metrics.tasks = Number(a.metrics.tasks) || 0;
      a.metrics.conversations = Number(a.metrics.conversations) || 0;
      a.metrics.responseRate = Number(a.metrics.responseRate) || 0;
      a.metrics.conversions = Number(a.metrics.conversions) || 0;
    }
  });
  if (!db.agents?.some((a) => a.id === "a_valentina")) {
    const fromSeed = seed().agents.find((a) => a.id === "a_valentina");
    if (fromSeed) db.agents.push(fromSeed);
  }
  db.teams?.forEach((t) => {
    if (!t.metrics || typeof t.metrics !== "object") {
      t.metrics = { leads: 0, meetings: 0, conversions: 0 };
    } else {
      t.metrics.leads = Number(t.metrics.leads) || 0;
      t.metrics.meetings = Number(t.metrics.meetings) || 0;
      t.metrics.conversions = Number(t.metrics.conversions) || 0;
    }
    if (t.id === "t_com" && !t.agentIds.includes("a_valentina")) t.agentIds.push("a_valentina");
  });
  // Funil: Proposta antes de Reunião. Sem site → Qualificado.
  for (const pl of db.pipelines || []) {
    if (pl.id === "pl_com" || /comercial/i.test(pl.name)) ensureCommercialStageOrder(pl);
  }
  promoteNoSiteDealsToQualified(db.deals || [], db.pipelines?.[0]);
  // Não força 1000/dia no hydrate — isso queimava o chip. Cap seguro se vier absurdo.
  for (const c of db.connections || []) {
    if ((c.dailyLimit || 0) > 200) c.dailyLimit = 80;
    if ((c.dailyLimit || 0) > 0 && c.dailyLimit < 20) c.dailyLimit = 40;
  }
  // Time Comercial sempre pode mover etapa no pipeline.
  db.agents?.forEach((a) => {
    if (a.teamId !== "t_com" && a.role !== "Closer" && a.role !== "SDR" && a.role !== "Qualificador") return;
    if (!a.tools.includes("crm.move_lead")) a.tools.push("crm.move_lead");
    if (!a.tools.includes("crm.assign_lead")) a.tools.push("crm.assign_lead");
    if (!a.permissions.includes("crm.edit")) a.permissions.push("crm.edit");
  });
  const platformOrg = db.organization?.id === PLATFORM_ORG || db.users?.some((u) => u.id === "u1" && u.kind === "platform");
  if (platformOrg) {
    // NÃO zera status/números no refresh — só garante a linha da agência existir.
    const hasAgency = (db.connections ?? []).some((c) => c.id === AGENCY_WHATSAPP.id || /info tech/i.test(c.name));
    if (!hasAgency) {
      db.connections = [
        ...(db.connections ?? []),
        {
          id: AGENCY_WHATSAPP.id,
          organizationId: db.organization.id,
          name: AGENCY_WHATSAPP.name,
          phone: AGENCY_WHATSAPP.phone,
          type: "cloud_api",
          status: "offline",
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
        u.email = "robsonalexdev@gmail.com";
        u.passwordHash = hashPw("320809eu", u.id);
        delete u.password;
        u.title = "CEO";
      }
    });
  } else if (!(db.connections ?? []).some((c) => c.id === AGENCY_WHATSAPP.id)) {
    db.connections = [
      {
        id: AGENCY_WHATSAPP.id,
        organizationId: db.organization.id,
        name: "WhatsApp",
        phone: "",
        type: "cloud_api",
        status: "offline",
        queue: 0,
        sentToday: 0,
        dailyLimit: 1000,
        lastSyncAt: new Date().toISOString(),
      },
    ];
  }
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
  if ((db.version ?? 0) < 8) {
    db.serviceOffers = liveServiceOffers(db.organization.id);
    applyCommercialAgentPrompts(db.agents ?? []);
    const team = db.teams?.find((t) => t.id === "t_com");
    if (team) team.objective = "Máquina de vendas: SDR por vertical, BANT em quem responde, Closer fecha reunião.";
    const sdr1 = db.agents?.find((a) => a.id === "a_sdr1");
    if (sdr1) sdr1.objective = "Vender reunião para saúde e beleza sem site.";
    const sdr2 = db.agents?.find((a) => a.id === "a_sdr2");
    if (sdr2) sdr2.objective = "Vender reunião para comércio e serviço local sem site.";
    const prod = db.memories?.find((m) => m.id === "mem_produtos");
    if (prod) {
      prod.content = "Tabela viva em Prospecção → Orçamentos. No WhatsApp só citar valor se o cliente perguntar.";
      prod.updatedAt = new Date().toISOString();
    }
    db.version = 8;
  }
  if ((db.version ?? 0) < 9) {
    db.operations = (db.operations ?? []).filter((o) => o.id === "op_live_maps" || !/^op\d+$/.test(o.id));
    db.approvals = (db.approvals ?? []).filter((a) => !/^ap\d+$/.test(a.id));
    db.version = 9;
  }
  if ((db.version ?? 0) < 10) {
    applyHumanTeam(db.agents ?? []);
    const team = db.teams?.find((t) => t.id === "t_com");
    if (team) {
      team.objective = "Marina e Camila abrem, Rafael qualifica, André e Valentina fecham reunião. Sem perseguir o mesmo número.";
    }
    db.version = 10;
  }
  if (!Array.isArray(db.sitePreviews)) db.sitePreviews = [];
  if ((db.version ?? 0) < 11) {
    const fromSeed = seed();
    for (const id of ["a_dev_fe", "a_dev_be", "a_dev_ds"]) {
      if (!db.agents?.some((a) => a.id === id)) {
        const a = fromSeed.agents.find((x) => x.id === id);
        if (a) db.agents.push(a);
      }
    }
    if (!db.teams?.some((t) => t.id === "t_dev")) {
      const t = fromSeed.teams.find((x) => x.id === "t_dev");
      if (t) db.teams.push(t);
    }
    applyHumanTeam(db.agents ?? []);
    db.version = 11;
  }
  if (!Array.isArray(db.quoteRequests)) db.quoteRequests = [];
  if (!Array.isArray(db.rpaJobs)) db.rpaJobs = [];
  if (!Array.isArray(db.radarSchedules)) db.radarSchedules = [];
  if (!Array.isArray(db.commercialProposals)) db.commercialProposals = [];
  if (!Array.isArray(db.commercialDossiers)) db.commercialDossiers = [];
  if (!Array.isArray(db.commercialDecisions)) db.commercialDecisions = [];
  if (!Array.isArray(db.missions)) db.missions = [];
  if (!Array.isArray(db.missionTasks)) db.missionTasks = [];
  if (!Array.isArray(db.missionEvents)) db.missionEvents = [];
  if (!Array.isArray(db.abExperiments)) db.abExperiments = [];
  if (!Array.isArray(db.invites)) db.invites = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.rpaJobs)) db.rpaJobs = [];
  if (!Array.isArray(db.radarSchedules)) db.radarSchedules = [];
  if (typeof db.killSwitchActive !== "boolean") db.killSwitchActive = false;
  if (!Array.isArray(db.dailyReports)) db.dailyReports = [];
  if ((db.version ?? 0) < 12) {
    ensureSaasUsers(db);
    db.version = 12;
  }
  if ((db.version ?? 0) < 13) {
    // Site + cardápio oficiais: R$ 100/mês · front público na Vercel.
    const live = liveServiceOffers(db.organization.id);
    if (!db.serviceOffers?.length) {
      db.serviceOffers = live;
    } else {
      const byId = new Map(db.serviceOffers.map((o) => [o.id, o]));
      for (const o of live) {
        const cur = byId.get(o.id);
        if (!cur) {
          db.serviceOffers.push(o);
          continue;
        }
        if (o.id === "svc_site" || o.id === "svc_cardapio" || o.id === "svc_landing") {
          cur.price = o.price;
          cur.billing = o.billing;
          cur.priceNote = o.priceNote;
          cur.description = o.description;
          cur.pitch = o.pitch;
          cur.name = o.name;
          cur.updatedAt = o.updatedAt;
        }
      }
    }
    db.version = 13;
  }
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
  db.users = (db.users || []).map(sanitizeUser);
  return db;
}

export function provisionCustomerAccount(user: User) {
  upsertAccount(user);
  const platform = parseDb(readJson<DB>(KEY)) ?? seed();
  if (!platform.users.some((u) => u.id === user.id)) platform.users.push(user);
  else platform.users = platform.users.map((u) => (u.id === user.id ? { ...u, ...user } : u));
  writeJson(KEY, platform);
  if (persistKey === KEY && state && !state.users.some((u) => u.id === user.id)) {
    state = { ...state, users: [...state.users, user] };
  }
  writeJson(wsKey(user.organizationId), createCustomerSeed(user));
}

export function patchUserEverywhere(userId: string, fn: (u: User) => void) {
  update((d) => {
    const u = d.users.find((x) => x.id === userId);
    if (u) fn(u);
  });
  const accounts = listAccounts();
  const acc = accounts.find((x) => x.id === userId);
  if (acc) {
    fn(acc);
    saveAccounts(accounts);
  }
  const touch = (db: DB | null, key: string) => {
    if (!db) return;
    const u = db.users.find((x) => x.id === userId);
    if (!u) return;
    fn(u);
    writeJson(key, db);
  };
  if (persistKey !== KEY) touch(parseDb(readJson<DB>(KEY)), KEY);
  if (acc?.kind === "customer" && acc.organizationId) {
    const key = wsKey(acc.organizationId);
    if (key !== persistKey) touch(parseDb(readJson<DB>(key)), key);
  }
}

export function syncDevTeamForAccount(userId: string) {
  const acc = listAccounts().find((u) => u.id === userId);
  if (!acc || isPlatformUser(acc)) return;
  if (state && state.users.some((u) => u.id === userId)) {
    applyDevTeamGate(state, acc.planId, acc.kind);
    persistNow();
    listeners.forEach((l) => l());
  }
  const key = wsKey(acc.organizationId);
  if (key !== persistKey) {
    const ws = parseDb(readJson<DB>(key));
    if (ws) {
      applyDevTeamGate(ws, acc.planId, acc.kind);
      writeJson(key, ws);
    }
  }
}

export function getDB(): DB {
  if (!state) state = load();
  return state;
}

function persistNow() {
  if (typeof window === "undefined" || !state) return;
  writeJson(persistKey, sanitizeDb(state));
}

function persist() {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistNow(), 250);
}

export function update(fn: (draft: DB) => void) {
  const next = structuredClone(getDB());
  fn(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
  // Espelha CRM/WhatsApp no Supabase — senão refresh some com leads e conexão.
  if (typeof window !== "undefined") {
    void import("@/lib/persist/cycle").then(({ scheduleCyclePush }) => scheduleCyclePush()).catch(() => {});
  }
}

export function getWorkspacePreference<T>(key: string, fallback: T): T {
  const value = getDB().clientPreferences?.[key];
  return value === undefined ? fallback : (value as T);
}

export function saveWorkspacePreference<T>(key: string, value: T): T {
  update((db) => {
    db.clientPreferences ??= {};
    db.clientPreferences[key] = value;
  });
  return value;
}

export function resetDB() {
  const user = state ? currentUser(state) : undefined;
  if (user && !isPlatformUser(user)) {
    state = createCustomerSeed(user);
  } else {
    persistKey = KEY;
    state = createSeed();
    saveAccounts(state.users);
  }
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
  return db.users.find((u) => u.id === db.currentUserId) ?? db.users[0];
}

export function can(db: DB, permission: string) {
  const user = currentUser(db);
  if (!user) return false;
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
