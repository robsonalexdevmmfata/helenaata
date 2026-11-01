import type { Contact, DB, Execution, User } from "@/lib/types";
import { isPlatformAdmin } from "@/lib/saas";
import { currentUser, getDB, update } from "@/lib/store";
import { api } from "@/lib/backend";
import { toast } from "sonner";

interface CycleContactRow {
  app_id?: string;
  id?: string;
  tags?: string[];
  cycle_state?: string | null;
  score?: number | null;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string | null;
  consent?: boolean | null;
  created_at?: string | null;
  last_contact_at?: string | null;
}

interface CycleExecutionRow {
  app_id?: string;
  id?: string;
  created_at?: string | null;
  actor?: string | null;
  actor_type?: string | null;
  action?: string | null;
  description?: string | null;
  result?: string | null;
  duration_ms?: number | null;
}

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

export function cycleSnapshot(db: DB, user: User) {
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
      phone: user.phone,
      evolutionInstance: user.evolutionInstance,
    },
    companies: db.companies.slice(0, 200).map((c) => ({
      id: c.id,
      name: c.name,
      segment: c.segment,
      city: c.city,
      website: c.website,
    })),
    contacts: db.contacts.slice(0, 300).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      status: c.status,
      source: c.source,
      tags: c.tags,
      consent: c.consent,
      opted_out: (c.tags || []).some((t) => /opt-?out/i.test(t)),
      score: c.score,
      opportunity: c.score >= 75 ? "alta" : c.score >= 50 ? "media" : "baixa",
      cycle_state: cycleOf(c),
    })),
    executions: db.executions.slice(0, 80).map((e: Execution) => ({
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
      .slice(0, 100)
      .map((c) => ({
        contactId: c.id,
        score: c.score,
        opportunity: c.score >= 75 ? "alta" : c.score >= 50 ? "media" : "baixa",
        findings: (c.tags || []).filter((t) => t.startsWith("#")),
        recommend_offer: (c.tags || []).includes("#sem-site")
          ? "Site institucional + WhatsApp"
          : "Automação de atendimento",
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
    memories: db.activities
      .filter((a) => a.type === "ia" && /obje|caro|retorno|LGPD|ciclo/i.test(a.text))
      .slice(0, 80)
      .map((a) => ({
        contactId: a.contactId,
        kind: /caro/i.test(a.text) ? "preco_alto" : /opt/i.test(a.text) ? "opt_out" : "nota",
        fact: a.text,
        created_by: a.actor,
      })),
  };
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;

export function scheduleCyclePush() {
  if (skipPersist()) return;
  const db = getDB();
  const user = currentUser(db);
  if (!user || isPlatformAdmin(user)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void api("/api/helena/cycle", {
      method: "POST",
      body: cycleSnapshot(db, user),
    }).catch((error: unknown) => {
      toast.error(
        `Não foi possível sincronizar os dados do ciclo: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
      );
    });
  }, 800);
}

export async function pullCycleIntoStore() {
  if (skipPersist()) return;
  const db = getDB();
  const user = currentUser(db);
  if (!user || isPlatformAdmin(user)) return;
  try {
    const data = await api<{
      ok?: boolean;
      contacts?: CycleContactRow[];
      executions?: CycleExecutionRow[];
    }>("/api/helena/cycle");
    if (!data?.ok || !Array.isArray(data.contacts)) return;
    update((d) => {
      for (const row of data.contacts) {
        const id = row.app_id || row.id;
        if (!id) continue;
        const existing = d.contacts.find((c) => c.id === id);
        const tags = [...(row.tags ?? [])];
        if (!tags.some((tag) => tag.startsWith("#ciclo-")) && row.cycle_state) {
          tags.push(`#ciclo-${row.cycle_state}`);
        }
        if (existing) {
          existing.score = row.score ?? existing.score;
          existing.tags = tags.length ? tags : existing.tags;
          existing.phone = row.phone || existing.phone;
          existing.name = row.name || existing.name;
        } else {
          d.contacts.unshift({
            id,
            organizationId: d.organization.id,
            name: row.name || "Lead",
            email: row.email || "",
            phone: row.phone || "",
            title: "",
            tags,
            source: row.source || "Prospecção",
            ownerId: d.currentUserId,
            status: row.status === "cliente" || row.status === "inativo" ? row.status : "lead",
            score: Number(row.score) || 0,
            consent: row.consent !== false,
            createdAt: row.created_at || new Date().toISOString(),
            lastContactAt: row.last_contact_at || new Date().toISOString(),
          });
        }
      }
      for (const row of data.executions || []) {
        const id = row.app_id || row.id;
        if (!id || d.executions.some((e) => e.id === id)) continue;
        d.executions.unshift({
          id,
          organizationId: d.organization.id,
          at: row.created_at || new Date().toISOString(),
          actor: row.actor || "Helena",
          actorType: row.actor_type || "helena",
          action: row.action || "sync",
          description: row.description || "",
          result: row.result || "sucesso",
          requestedBy: row.actor || "Helena",
          durationMs: row.duration_ms || 0,
        });
      }
    });
  } catch (error) {
    toast.error(
      `Não foi possível carregar os dados do ciclo: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
    );
  }
}
