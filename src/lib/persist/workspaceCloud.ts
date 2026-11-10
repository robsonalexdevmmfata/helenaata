import type { DB } from "@/lib/types";

/** Campos do CRM/IA/WhatsApp/RPA que sobem pro Supabase (sistema inteiro). */
export const WORKSPACE_CLOUD_KEYS = [
  "organization",
  "clientPreferences",
  "companies",
  "contacts",
  "pipelines",
  "deals",
  "activities",
  "tasks",
  "calendarEvents",
  "meetings",
  "salesFlow",
  "conversations",
  "quickReplies",
  "agents",
  "teams",
  "operations",
  "missions",
  "missionTasks",
  "missionEvents",
  "abExperiments",
  "autonomyLevel",
  "killSwitchActive",
  "approvals",
  "executions",
  "memories",
  "knowledge",
  "toolSettings",
  "lists",
  "campaigns",
  "cadences",
  "automations",
  "serviceOffers",
  "sitePreviews",
  "quoteRequests",
  "connections",
  "templates",
  "webhooks",
  "webhookLogs",
  "apiTokens",
  "providers",
  "aiUsage",
  "helenaMessages",
  "helenaSettings",
  "rolePermissions",
  "lgpdRequests",
  "invoices",
  "rpaJobs",
  "radarSchedules",
  "commercialProposals",
  "commercialDossiers",
  "commercialDecisions",
  "dailyReports",
  "retentionDays",
  "organizationSettings",
] as const;

type CloudKey = (typeof WORKSPACE_CLOUD_KEYS)[number];

function trimConversations(list: DB["conversations"]) {
  return (list || []).slice(0, 1000).map((c) => ({
    ...c,
    messages: (c.messages || []).slice(-80),
  }));
}

/** Serializa o banco operacional pra JSONB no Supabase. */
export function serializeWorkspace(db: DB) {
  const out: Record<string, unknown> = {
    version: db.version,
    savedAt: new Date().toISOString(),
  };
  for (const key of WORKSPACE_CLOUD_KEYS) {
    const value = db[key as keyof DB];
    if (key === "conversations") {
      out[key] = trimConversations(db.conversations);
      continue;
    }
    if (key === "helenaMessages") {
      out[key] = (db.helenaMessages || []).slice(0, 300);
      continue;
    }
    if (key === "executions") {
      out[key] = (db.executions || []).slice(0, 300);
      continue;
    }
    if (key === "activities") {
      out[key] = (db.activities || []).slice(0, 800);
      continue;
    }
    if (key === "aiUsage") {
      out[key] = (db.aiUsage || []).slice(0, 200);
      continue;
    }
    if (key === "webhookLogs") {
      out[key] = (db.webhookLogs || []).slice(0, 200);
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 2000);
      continue;
    }
    out[key] = value;
  }
  // Contas do workspace (sem senha em texto puro).
  out.users = (db.users || []).map((u) => ({
    ...u,
    password: undefined,
  }));
  return out;
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  if (!remote?.length) return local || [];
  if (!local?.length) return remote;
  const map = new Map<string, T>();
  for (const row of local) map.set(row.id, row);
  for (const row of remote) {
    const prev = map.get(row.id);
    map.set(row.id, prev ? { ...prev, ...row } : row);
  }
  return Array.from(map.values());
}

/**
 * Aplica snapshot do Supabase no draft do store.
 * Preferência: nuvem ganha em settings; arrays mesclam por id (nuvem atualiza campos).
 */
export function applyWorkspaceCloud(draft: DB, cloud: Record<string, unknown> | null | undefined) {
  if (!cloud || typeof cloud !== "object") return 0;
  let touched = 0;

  for (const key of WORKSPACE_CLOUD_KEYS) {
    if (!(key in cloud)) continue;
    const remote = cloud[key];
    if (remote === undefined) continue;

    if (key === "organization" && remote && typeof remote === "object") {
      draft.organization = { ...draft.organization, ...(remote as DB["organization"]) };
      touched += 1;
      continue;
    }
    if (key === "salesFlow" && remote && typeof remote === "object") {
      draft.salesFlow = { ...draft.salesFlow, ...(remote as DB["salesFlow"]) };
      touched += 1;
      continue;
    }
    if (key === "helenaSettings" && remote && typeof remote === "object") {
      draft.helenaSettings = { ...draft.helenaSettings, ...(remote as DB["helenaSettings"]) };
      touched += 1;
      continue;
    }
    if (key === "clientPreferences" && remote && typeof remote === "object") {
      draft.clientPreferences = { ...(draft.clientPreferences || {}), ...(remote as Record<string, unknown>) };
      touched += 1;
      continue;
    }
    if (key === "organizationSettings" && remote && typeof remote === "object") {
      draft.organizationSettings = {
        ...(draft.organizationSettings || { retentionDays: 730, mfaEnabled: false, ipWhitelist: [] }),
        ...(remote as NonNullable<DB["organizationSettings"]>),
      };
      touched += 1;
      continue;
    }
    if (key === "rolePermissions" && remote && typeof remote === "object") {
      draft.rolePermissions = { ...draft.rolePermissions, ...(remote as DB["rolePermissions"]) };
      touched += 1;
      continue;
    }
    if (key === "autonomyLevel" && typeof remote === "number") {
      draft.autonomyLevel = remote as DB["autonomyLevel"];
      touched += 1;
      continue;
    }
    if (key === "killSwitchActive" && typeof remote === "boolean") {
      draft.killSwitchActive = remote;
      touched += 1;
      continue;
    }
    if (key === "retentionDays" && typeof remote === "number") {
      draft.retentionDays = remote;
      touched += 1;
      continue;
    }

    if (Array.isArray(remote)) {
      const localArr = (draft[key as CloudKey] as { id: string }[]) || [];
      // Conversas: mescla mensagens
      if (key === "conversations") {
        const byId = new Map(localArr.map((c) => [c.id, c as DB["conversations"][0]]));
        for (const row of remote as DB["conversations"]) {
          if (!row?.id) continue;
          const prev = byId.get(row.id);
          if (!prev) {
            byId.set(row.id, row);
            continue;
          }
          const seen = new Set((prev.messages || []).map((m) => m.id));
          const msgs = [...(prev.messages || [])];
          for (const m of row.messages || []) {
            if (m?.id && !seen.has(m.id)) {
              msgs.push(m);
              seen.add(m.id);
            }
          }
          msgs.sort((a, b) => +new Date(a.at) - +new Date(b.at));
          byId.set(row.id, {
            ...prev,
            ...row,
            messages: msgs.slice(-100),
            remoteJid: row.remoteJid || prev.remoteJid,
            lastMessageAt: row.lastMessageAt || prev.lastMessageAt,
          });
        }
        draft.conversations = Array.from(byId.values());
        touched += 1;
        continue;
      }
      // Connections: nunca perde telefone nem “online” sem motivo
      if (key === "connections") {
        const merged = mergeById(localArr as DB["connections"], remote as DB["connections"]);
        draft.connections = merged.map((c) => {
          const local = (localArr as DB["connections"]).find((x) => x.id === c.id);
          const phone = c.phone || local?.phone || "";
          const status =
            local?.status === "online" && !c.phone && !/offline/i.test(String(c.status || ""))
              ? "online"
              : c.status || local?.status || "offline";
          return {
            ...c,
            phone,
            status,
            dailyLimit: Math.max(c.dailyLimit || 0, local?.dailyLimit || 0, 1000),
            lastSyncAt: c.lastSyncAt || local?.lastSyncAt,
          };
        });
        touched += 1;
        continue;
      }
      (draft as Record<string, unknown>)[key] = mergeById(localArr as { id: string }[], remote as { id: string }[]);
      touched += 1;
    }
  }

  if (Array.isArray(cloud.users)) {
    const remoteUsers = cloud.users as DB["users"];
    for (const ru of remoteUsers) {
      if (!ru?.id) continue;
      const local = draft.users.find((u) => u.id === ru.id);
      if (local) {
        Object.assign(local, { ...ru, password: undefined, passwordHash: ru.passwordHash || local.passwordHash });
      } else {
        draft.users.push({ ...ru, password: undefined });
      }
    }
    touched += 1;
  }

  return touched;
}
