import type { Contact, Conversation, DB, Deal, Execution, User } from "@/lib/types";
import { currentUser, getDB, update } from "@/lib/store";
import { applyWorkspaceCloud, serializeWorkspace } from "@/lib/persist/workspaceCloud";

function skipPersist() {
  try {
    if (import.meta.env?.MODE === "test" || import.meta.env?.VITEST) return true;
  } catch {
    /* vitest / node */
  }
  if (typeof window === "undefined") return true;
  return false;
}

function cycleOf(c: Contact) {
  const tag = (c.tags || []).find((t) => t.startsWith("#ciclo-"));
  return tag ? tag.slice(7) : c.score > 0 ? "diagnosticado" : "novo";
}

export function realPhone(phone?: string | null) {
  const p = String(phone || "").trim();
  if (!p || /aguardando|qr|pending/i.test(p)) return "";
  return p;
}

function cycleSnapshot(db: DB, user: User) {
  const wa =
    (db.connections || []).find((c) => c.status === "online" && realPhone(c.phone))
    || (db.connections || []).find((c) => /info tech|helena/i.test(c.name) && realPhone(c.phone))
    || (db.connections || []).find((c) => realPhone(c.phone));
  const instanceFromConn = wa?.id?.startsWith("wa_") && wa.id !== "wa_agency"
    ? wa.id.slice(3)
    : undefined;
  return {
    tenant: {
      appUserId: user.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      companyName: user.companyName || db.organization.name,
      organizationId: user.organizationId,
      orgSlug: user.organizationId,
      plan: user.planId || "trial",
      phone: realPhone(wa?.phone) || realPhone(user.phone) || "",
      whatsappPhone: realPhone(wa?.phone) || realPhone(user.phone) || "",
      evolutionInstance: user.evolutionInstance || instanceFromConn || "helena",
    },
    companies: db.companies.slice(0, 1000).map((c) => ({
      id: c.id,
      name: c.name,
      segment: c.segment,
      city: c.city,
      website: c.website,
    })),
    contacts: db.contacts.slice(0, 1000).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      companyId: c.companyId,
      status: c.status,
      source: c.source,
      tags: c.tags,
      consent: c.consent,
      opted_out: (c.tags || []).some((t) => /opt-?out/i.test(t)),
      score: c.score,
      opportunity: c.score >= 75 ? "alta" : c.score >= 50 ? "media" : "baixa",
      cycle_state: cycleOf(c),
      lastContactAt: c.lastContactAt,
    })),
    // Conversas + mensagens: não são temporárias — evitam reabordar e somem do Inbox.
    conversations: db.conversations.slice(0, 800).map((c) => ({
      id: c.id,
      contactId: c.contactId,
      channel: c.channel,
      connectionId: c.connectionId,
      remoteJid: c.remoteJid,
      status: c.status,
      handlerType: c.handlerType,
      handlerId: c.handlerId,
      unread: c.unread,
      sentiment: c.sentiment,
      lastMessageAt: c.lastMessageAt,
      flow: c.flow,
      messages: (c.messages || []).slice(-60).map((m) => ({
        id: m.id,
        from: m.from,
        authorName: m.authorName,
        text: m.text,
        at: m.at,
        kind: m.kind,
        deliveryStatus: m.deliveryStatus,
        externalId: m.externalId,
      })),
    })),
    deals: (db.deals || []).slice(0, 800).map((d: Deal) => ({
      id: d.id,
      title: d.title,
      contactId: d.contactId,
      companyId: d.companyId,
      pipelineId: d.pipelineId,
      stageId: d.stageId,
      value: d.value,
      status: d.status,
      source: d.source,
      tags: d.tags,
      ownerId: d.ownerId,
      ownerType: d.ownerType,
      probability: d.probability,
      expectedClose: d.expectedClose,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    executions: db.executions.slice(0, 120).map((e: Execution) => ({
      id: e.id,
      actor: e.actor,
      actorType: e.actorType,
      action: e.action,
      description: e.description,
      result: e.result,
      params: e.params,
      durationMs: e.durationMs,
    })),
    diagnoses: db.contacts
      .filter((c) => c.score > 0)
      .slice(0, 200)
      .map((c) => ({
        contactId: c.id,
        score: c.score,
        opportunity: c.score >= 75 ? "alta" : c.score >= 50 ? "media" : "baixa",
        findings: (c.tags || []).filter((t) => t.startsWith("#")),
        recommend_offer: (c.tags || []).includes("#sem-site") ? "Site institucional + WhatsApp" : "Automação de atendimento",
        recommend_pitch: `Diagnóstico Helena: ${c.name} (${c.score}/100).`,
      })),
    rpaJobs: (db.rpaJobs || []).slice(0, 80).map((j) => ({
      id: j.id,
      kind: j.kind,
      contactId: j.contactId,
      payload: j.payload,
      runAt: j.runAt,
      idempotencyKey: j.idempotencyKey,
    })),
    // WhatsApp + prévias: sem isso, refresh “desconecta” e some prospecção.
    connections: (db.connections || []).slice(0, 20).map((c) => ({
      id: c.id,
      name: c.name,
      phone: realPhone(c.phone) || realPhone(wa?.phone) || "",
      type: c.type,
      status: c.status === "online" || realPhone(c.phone) ? (c.status === "conectando" && !realPhone(c.phone) ? "conectando" : c.status) : c.status,
      queue: c.queue,
      sentToday: c.sentToday,
      dailyLimit: Math.max(c.dailyLimit || 0, 1000),
      lastSyncAt: c.lastSyncAt,
    })),
    // Payload completo — o /v/:slug e o upsert no Supabase precisam de menu/fotos/tagline.
    sitePreviews: (db.sitePreviews || []).slice(0, 200),
    memories: db.activities
      .filter((a) => a.type === "ia" && /obje|caro|retorno|LGPD|ciclo/i.test(a.text))
      .slice(0, 80)
      .map((a) => ({
        contactId: a.contactId,
        kind: /caro/i.test(a.text) ? "preco_alto" : /opt/i.test(a.text) ? "opt_out" : "nota",
        fact: a.text,
        created_by: a.actor,
      })),
    // Sistema inteiro (CRM, IA, times, RPA, WhatsApp, agenda, prévias…).
    workspace: serializeWorkspace(db),
  };
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let hooksInstalled = false;

/** Grava no Supabase agora (WhatsApp + CRM). Usar após conectar o chip. */
export async function flushCyclePush(): Promise<{ ok: boolean; error?: string }> {
  if (skipPersist()) return { ok: true };
  const db = getDB();
  const user = currentUser(db);
  if (!user) return { ok: false, error: "sem usuário" };
  clearTimeout(pushTimer);
  const token = typeof window !== "undefined" ? window.localStorage.getItem("helena-backend-token") : "";
  const body = JSON.stringify(cycleSnapshot(getDB(), user));
  try {
    const res = await fetch("/api/helena/cycle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      keepalive: true,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falha de rede" };
  }
}

export function scheduleCyclePush() {
  if (skipPersist()) return;
  const db = getDB();
  const user = currentUser(db);
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushCyclePush();
  }, 400);
}

/** Ao fechar/trocar aba: manda snapshot pro Supabase (não perde WhatsApp/número). */
export function installCyclePersistHooks() {
  if (skipPersist() || hooksInstalled || typeof window === "undefined") return;
  hooksInstalled = true;
  const kick = () => {
    const db = getDB();
    const user = currentUser(db);
    if (!user) return;
    const token = window.localStorage.getItem("helena-backend-token") || "";
    const body = JSON.stringify(cycleSnapshot(db, user));
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/helena/cycle", blob);
        return;
      }
    } catch {
      /* fallback fetch */
    }
    void fetch("/api/helena/cycle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      keepalive: true,
    }).catch(() => {});
  };
  window.addEventListener("pagehide", kick);
  window.addEventListener("beforeunload", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") kick();
  });
}

function mergeConversations(d: DB, rows: any[]) {
  for (const row of rows) {
    const id = row.id || row.app_id;
    if (!id || !row.contactId) continue;
    const existing = d.conversations.find((c) => c.id === id);
    const messages = Array.isArray(row.messages) ? row.messages : [];
    if (existing) {
      existing.remoteJid = row.remoteJid || existing.remoteJid;
      existing.status = row.status || existing.status;
      existing.lastMessageAt = row.lastMessageAt || existing.lastMessageAt;
      existing.flow = row.flow || existing.flow;
      const seen = new Set(existing.messages.map((m) => m.id));
      for (const m of messages) {
        if (!m?.id || seen.has(m.id)) continue;
        existing.messages.push(m);
        seen.add(m.id);
      }
      existing.messages.sort((a, b) => +new Date(a.at) - +new Date(b.at));
      continue;
    }
    d.conversations.unshift({
      id,
      organizationId: d.organization.id,
      contactId: row.contactId,
      channel: row.channel || "whatsapp",
      connectionId: row.connectionId,
      remoteJid: row.remoteJid,
      status: row.status === "resolvida" || row.status === "pendente" ? row.status : "aberta",
      handlerType: row.handlerType || "agent",
      handlerId: row.handlerId || d.currentUserId,
      unread: Number(row.unread) || 0,
      sentiment: row.sentiment || "neutro",
      lastMessageAt: row.lastMessageAt || new Date().toISOString(),
      flow: row.flow,
      messages,
    } as Conversation);
  }
}

export async function pullCycleIntoStore() {
  if (skipPersist()) return;
  const db = getDB();
  const user = currentUser(db);
  if (!user) return;
  try {
    const res = await fetch(`/api/helena/cycle?appUserId=${encodeURIComponent(user.id)}&email=${encodeURIComponent(user.email)}`);
    const data = await res.json().catch(() => ({}));
    if (!data?.ok) return;
    update((d) => {
      // 1) Workspace completo do Supabase (prioridade).
      const cloud = data.inbox?.workspace || data.workspace;
      if (cloud) applyWorkspaceCloud(d, cloud);
      for (const row of data.contacts ?? []) {
        const id = row.app_id || row.id;
        if (!id) continue;
        const existing = d.contacts.find((c) => c.id === id);
        const tags = Array.isArray(row.tags) ? row.tags : [];
        if (!tags.some((t: string) => t.startsWith("#ciclo-")) && row.cycle_state) {
          tags.push(`#ciclo-${row.cycle_state}`);
        }
        if (existing) {
          existing.score = row.score ?? existing.score;
          existing.tags = tags.length ? tags : existing.tags;
          existing.phone = row.phone || existing.phone;
          existing.name = row.name || existing.name;
          if (row.companyId) existing.companyId = row.companyId;
        } else {
          d.contacts.unshift({
            id,
            organizationId: d.organization.id,
            name: row.name || "Lead",
            email: row.email || "",
            phone: row.phone || "",
            companyId: row.companyId || row.company_id,
            title: "",
            tags,
            source: (row.source || "Prospecção") as Contact["source"],
            ownerId: d.currentUserId,
            status: row.status === "cliente" || row.status === "inativo" ? row.status : "lead",
            score: Number(row.score) || 0,
            consent: row.consent !== false,
            createdAt: row.created_at || new Date().toISOString(),
            lastContactAt: row.last_contact_at || row.lastContactAt || new Date().toISOString(),
          });
        }
      }
      if (Array.isArray(data.conversations)) mergeConversations(d, data.conversations);
      if (Array.isArray(data.inbox?.conversations)) mergeConversations(d, data.inbox.conversations);
      for (const row of data.deals || data.inbox?.deals || []) {
        const id = row.id || row.app_id;
        if (!id || d.deals.some((x) => x.id === id)) continue;
        const pipeline = d.pipelines[0];
        const stage = pipeline?.stages[0];
        d.deals.unshift({
          id,
          organizationId: d.organization.id,
          pipelineId: row.pipelineId || pipeline?.id || "pl1",
          stageId: row.stageId || stage?.id || "s1",
          title: row.title || "Lead",
          contactId: row.contactId,
          companyId: row.companyId,
          value: Number(row.value) || 100,
          probability: Number(row.probability) || 10,
          expectedClose: row.expectedClose || new Date(Date.now() + 20 * 86_400_000).toISOString(),
          ownerId: row.ownerId || d.currentUserId,
          ownerType: row.ownerType || "agent",
          source: row.source || "Prospecção",
          status: row.status || "aberto",
          tags: row.tags || [],
          createdAt: row.createdAt || new Date().toISOString(),
          updatedAt: row.updatedAt || new Date().toISOString(),
        } as Deal);
      }
      for (const row of data.executions || []) {
        const id = row.app_id || row.id;
        if (!id || d.executions.some((e) => e.id === id)) continue;
        d.executions.unshift({
          id,
          organizationId: d.organization.id,
          at: row.created_at || new Date().toISOString(),
          actor: row.actor || "Helena",
          actorType: (row.actor_type || "helena") as Execution["actorType"],
          action: row.action || "sync",
          description: row.description || "",
          result: (row.result || "sucesso") as Execution["result"],
          requestedBy: row.actor || "Helena",
          durationMs: row.duration_ms || 0,
        });
      }
      const snap = data.inbox || {};
      const savedPhone = String(data.whatsappPhone || data.profile?.phone || snap.whatsappPhone || "").trim();
      for (const row of data.connections || snap.connections || []) {
        if (!row?.id) continue;
        const existing = d.connections.find((c) => c.id === row.id);
        if (existing) {
          existing.name = row.name || existing.name;
          // Número gravado no Supabase nunca some no refresh.
          existing.phone = row.phone || existing.phone || savedPhone;
          if (row.status === "online" || row.status === "offline" || row.status === "conectando") {
            existing.status = row.status;
          }
          if (row.lastSyncAt) existing.lastSyncAt = row.lastSyncAt;
          if (Number.isFinite(Number(row.dailyLimit))) existing.dailyLimit = Math.max(Number(row.dailyLimit) || 0, 1000);
        } else {
          d.connections.push({
            id: row.id,
            organizationId: d.organization.id,
            name: row.name || "WhatsApp",
            phone: row.phone || savedPhone || "",
            type: row.type || "cloud_api",
            status: row.status === "online" ? "online" : "offline",
            queue: Number(row.queue) || 0,
            sentToday: Number(row.sentToday) || 0,
            dailyLimit: Math.max(Number(row.dailyLimit) || 0, 1000),
            lastSyncAt: row.lastSyncAt || new Date().toISOString(),
          });
        }
      }
      if (savedPhone) {
        const agency = d.connections.find((c) => c.id === "wa_agency" || /info tech|helena/i.test(c.name)) || d.connections[0];
        if (agency && !agency.phone) agency.phone = savedPhone;
      }
      if (Array.isArray(snap.companies)) {
        for (const row of snap.companies) {
          const id = row.id || row.app_id;
          if (!id || d.companies.some((c) => c.id === id)) continue;
          d.companies.unshift({
            id,
            organizationId: d.organization.id,
            name: row.name || "Empresa",
            segment: row.segment || "",
            city: row.city || "",
            size: "1–10",
            website: row.website || "",
            ownerId: d.currentUserId,
            createdAt: row.createdAt || new Date().toISOString(),
          });
        }
      }
    });
    // Sessão Evolution: atualiza status, mas NUNCA apaga o número salvo.
    void import("@/lib/evolution/evolutionapi").then(async ({ getEvolutionStatus }) => {
      const st = await getEvolutionStatus().catch(() => null);
      if (!st) return;
      update((d) => {
        const conn = d.connections.find((c) => c.status === "online" || c.status === "conectando" || /info tech|helena/i.test(c.name))
          ?? d.connections[0];
        if (!conn) return;
        const keptPhone = conn.phone;
        conn.status = st.connected ? "online" : conn.status === "conectando" ? "conectando" : "offline";
        conn.phone = st.number || keptPhone;
        conn.lastSyncAt = new Date().toISOString();
      });
      if (st.connected || st.number) void flushCyclePush();
    });
  } catch {
    /* offline */
  }
}
