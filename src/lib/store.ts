import { useSyncExternalStore } from "react";
import type { DB } from "./types";
import {
  applyDevTeamGate,
  createCustomerSeed,
  createSeed,
  defaultSalesFlow,
  liveMapsAutomations,
  ensureSaasUsers,
  PLATFORM_ORG,
} from "./seed";
import type { User } from "./types";
import { applyCommercialAgentPrompts, applyHumanTeam, liveServiceOffers } from "./catalog";
import { TOOL_REGISTRY, withCalendarTools } from "./helena/registry";
import { AGENCY_WHATSAPP } from "./evolution/evolutionapi";
import { hashPw, sanitizeDb, sanitizeUser } from "@/lib/security/secrets";
import { api } from "@/lib/backend";
import { toast } from "sonner";

let seedCache: DB | null = null;
const seed = () => (seedCache ??= createSeed());

let state: DB | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let cloudRevision = 0;
let cloudPersistenceEnabled = false;
let pendingSnapshot: DB | null = null;
let savePromise: Promise<void> | null = null;
const testAccounts = new Map<string, User>();

function isPlatformUser(user?: User | null) {
  if (!user) return false;
  if (user.kind === "platform") return true;
  return user.role === "owner" && user.id === "u1";
}

export function listAccounts(): User[] {
  if (import.meta.env.MODE !== "test") return state?.users ?? [];
  const accounts = new Map<string, User>();
  for (const user of [...seed().users, ...(state?.users ?? []), ...testAccounts.values()]) {
    accounts.set(user.id, user);
  }
  return [...accounts.values()];
}

export function upsertAccount(user: User) {
  if (!state) return;
  update((db) => {
    const index = db.users.findIndex((entry) => entry.id === user.id);
    if (index >= 0) db.users[index] = sanitizeUser({ ...db.users[index], ...user });
    else db.users.push(sanitizeUser(user));
  });
}

function load(): DB {
  if (import.meta.env.MODE === "test") return seed();
  throw new Error("Workspace não carregado do Supabase. Faça login novamente.");
}

export async function activateWorkspaceForUser(user: User) {
  const { snapshot, revision, accounts } = await api<{
    snapshot: DB | null;
    revision: number;
    accounts: User[];
  }>("/api/workspace");
  if (snapshot && snapshot.organization?.id !== user.organizationId) {
    throw new Error("O workspace recebido não pertence à conta autenticada.");
  }
  state = snapshot ?? createCustomerSeed(user);
  state.currentUserId = user.id;
  if (isPlatformUser(user)) {
    state.users = [sanitizeUser(user), ...accounts.map(sanitizeUser)];
  } else {
    const userIndex = state.users.findIndex((entry) => entry.id === user.id);
    if (userIndex >= 0) state.users[userIndex] = sanitizeUser(user);
    else state.users.unshift(sanitizeUser(user));
    applyDevTeamGate(state, user.planId, user.kind);
  }
  const hydratedSnapshot = JSON.stringify(state);
  state = sanitizeDb(state);
  cloudRevision = revision;
  cloudPersistenceEnabled = true;
  pendingSnapshot = null;
  if (!snapshot) {
    try {
      const saved = await api<{ revision: number }>("/api/workspace", {
        method: "PUT",
        body: { snapshot: state, revision: cloudRevision },
      });
      cloudRevision = saved.revision;
    } catch (error) {
      cloudPersistenceEnabled = false;
      state = null;
      throw error;
    }
  } else if (JSON.stringify(state) !== hydratedSnapshot) {
    persistNow();
  }
  listeners.forEach((listener) => listener());
}

export function deactivateWorkspace() {
  cloudPersistenceEnabled = false;
  pendingSnapshot = null;
  state = null;
  listeners.forEach((listener) => listener());
}

/** Completa campos de schema nas bases de teste e nos snapshots legados. */
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
    a.metrics = { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 };
  });
  if (!db.agents?.some((a) => a.id === "a_valentina")) {
    const fromSeed = seed().agents.find((a) => a.id === "a_valentina");
    if (fromSeed) db.agents.push(fromSeed);
  }
  db.teams?.forEach((t) => {
    t.metrics = { leads: 0, meetings: 0, conversions: 0 };
    if (t.id === "t_com" && !t.agentIds.includes("a_valentina")) t.agentIds.push("a_valentina");
  });
  const platformOrg =
    db.organization?.id === PLATFORM_ORG ||
    db.users?.some((u) => u.id === "u1" && u.kind === "platform");
  if (platformOrg) {
    db.connections = (db.connections ?? []).filter(
      (c) => c.id === AGENCY_WHATSAPP.id || /info tech/i.test(c.name),
    );
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
    db.deals = (db.deals ?? []).filter(
      (d) =>
        !demo(d.id, "d") &&
        keepContact.has(d.contactId) &&
        (!d.companyId || keepCompany.has(d.companyId)),
    );
    db.tasks = (db.tasks ?? []).filter((t) => !/^tk\d+$/.test(t.id));
    db.conversations = (db.conversations ?? []).filter(
      (c) => !/^cv\d+$/.test(c.id) && keepContact.has(c.contactId),
    );
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
    db.calendarEvents = (db.calendarEvents ?? []).filter(
      (e) => !/^ev\d+$/.test(e.id) && keepContact.has(e.leadId),
    );
    db.memories = [
      {
        id: "mem_produtos",
        organizationId: db.organization.id,
        type: "permanente",
        title: "Produtos e serviços",
        content:
          "Info Tech Ltda: sites institucionais (a partir de R$ 4.900), landing pages (R$ 1.900), gestão de tráfego (R$ 1.800/mês), automação de WhatsApp (R$ 3.500).",
        source: "Robson Alex",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "mem_icp",
        organizationId: db.organization.id,
        type: "permanente",
        title: "ICP principal",
        content:
          "Empresas B2B no Brasil sem site (ou site fraco) e com WhatsApp ativo. Nicho definido na varredura.",
        source: "Robson Alex",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "mem_tom",
        organizationId: db.organization.id,
        type: "permanente",
        title: "Tom de comunicação",
        content:
          "Cordial, direto e consultivo. Sem gírias. Abordagem no WhatsApp com a personalidade do Robson Alex.",
        source: "Robson Alex",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "mem_horario",
        organizationId: db.organization.id,
        type: "permanente",
        title: "Horário comercial",
        content: "Prospecção Seg–Sex, 09:00–18:00 (America/Sao_Paulo). Não disparar aos domingos.",
        source: "Robson Alex",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "mem_desconto",
        organizationId: db.organization.id,
        type: "permanente",
        title: "Política de desconto",
        content:
          "Desconto máximo de 10% sem aprovação do Robson. Acima disso, encaminhar para o CEO.",
        source: "Robson Alex",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
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
    if (team)
      team.objective =
        "Máquina de vendas: SDR por vertical, BANT em quem responde, Closer fecha reunião.";
    const sdr1 = db.agents?.find((a) => a.id === "a_sdr1");
    if (sdr1) sdr1.objective = "Vender reunião para saúde e beleza sem site.";
    const sdr2 = db.agents?.find((a) => a.id === "a_sdr2");
    if (sdr2) sdr2.objective = "Vender reunião para comércio e serviço local sem site.";
    const prod = db.memories?.find((m) => m.id === "mem_produtos");
    if (prod) {
      prod.content =
        "Tabela viva em Prospecção → Orçamentos. No WhatsApp só citar valor se o cliente perguntar.";
      prod.updatedAt = new Date().toISOString();
    }
    db.version = 8;
  }
  if ((db.version ?? 0) < 9) {
    db.operations = (db.operations ?? []).filter(
      (o) => o.id === "op_live_maps" || !/^op\d+$/.test(o.id),
    );
    db.approvals = (db.approvals ?? []).filter((a) => !/^ap\d+$/.test(a.id));
    db.version = 9;
  }
  if ((db.version ?? 0) < 10) {
    applyHumanTeam(db.agents ?? []);
    const team = db.teams?.find((t) => t.id === "t_com");
    if (team) {
      team.objective =
        "Marina e Camila abrem, Rafael qualifica, André e Valentina fecham reunião. Sem perseguir o mesmo número.";
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
  if (typeof db.killSwitchActive !== "boolean") db.killSwitchActive = false;
  if (!Array.isArray(db.dailyReports)) db.dailyReports = [];
  if ((db.version ?? 0) < 12) {
    ensureSaasUsers(db);
    db.version = 12;
  }
  if ((db.version ?? 0) < 13) {
    if (db.salesFlow?.noReplyHours === 48) db.salesFlow.noReplyHours = 24;
    const menuOffer = liveServiceOffers(db.organization.id).find(
      (offer) => offer.id === "svc_menu_online",
    );
    if (menuOffer && !db.serviceOffers.some((offer) => offer.id === menuOffer.id))
      db.serviceOffers.push(menuOffer);
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
  if (import.meta.env.MODE === "test") {
    testAccounts.set(user.id, sanitizeUser(user));
    update((db) => {
      if (!db.users.some((entry) => entry.id === user.id)) db.users.push(sanitizeUser(user));
    });
    return;
  }
  if (state?.organization.id === user.organizationId) upsertAccount(user);
}

export function patchUserEverywhere(userId: string, fn: (u: User) => void) {
  update((d) => {
    const u = d.users.find((x) => x.id === userId);
    if (u) fn(u);
  });
}

export function syncDevTeamForAccount(userId: string) {
  const account = listAccounts().find((u) => u.id === userId);
  if (!account || isPlatformUser(account) || !state) return;
  update((db) => applyDevTeamGate(db, account.planId, account.kind));
}

export function getDB(): DB {
  if (!state) state = load();
  return state;
}

function persistNow() {
  if (!cloudPersistenceEnabled || !state) return;
  pendingSnapshot = sanitizeDb(state);
  if (savePromise) return;
  savePromise = (async () => {
    while (pendingSnapshot && cloudPersistenceEnabled) {
      const snapshot = pendingSnapshot;
      pendingSnapshot = null;
      try {
        const result = await api<{ revision: number }>("/api/workspace", {
          method: "PUT",
          body: { snapshot, revision: cloudRevision },
        });
        cloudRevision = result.revision;
      } catch (error) {
        pendingSnapshot ??= snapshot;
        if (error instanceof Error && "status" in error && error.status === 409) {
          cloudPersistenceEnabled = false;
          toast.error(
            "Este workspace foi alterado em outro dispositivo. Recarregue a página antes de continuar.",
          );
        } else {
          toast.error(
            `Não foi possível salvar no Supabase: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
          );
        }
        break;
      }
    }
  })().finally(() => {
    savePromise = null;
  });
}

function persist() {
  if (!cloudPersistenceEnabled) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistNow(), 250);
}

export async function flushWorkspace() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistNow();
  if (savePromise) await savePromise;
  if (pendingSnapshot)
    throw new Error("Há alterações do workspace que ainda não foram salvas no Supabase.");
}

export function update(fn: (draft: DB) => void) {
  const next = structuredClone(getDB());
  fn(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function getWorkspacePreference<T>(key: string, fallback: T): T {
  const value = state?.clientPreferences?.[key];
  return value === undefined ? fallback : (value as T);
}

export function saveWorkspacePreference<T>(key: string, value: T): T {
  if (!state) return value;
  update((db) => {
    db.clientPreferences ??= {};
    db.clientPreferences[key] = value;
  });
  return value;
}

export function resetDB() {
  if (import.meta.env.MODE === "test") {
    testAccounts.clear();
    cloudPersistenceEnabled = false;
    state = createSeed();
    listeners.forEach((listener) => listener());
    return;
  }
  const previous = state;
  if (!previous) return;
  const user = currentUser(previous);
  if (!user) return;
  state = createCustomerSeed(user);
  state.users = previous.users.map(sanitizeUser);
  state.currentUserId = user.id;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, load);
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
