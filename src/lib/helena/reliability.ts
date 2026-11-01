/** Confiabilidade e governança sobre o store real. Sem laboratório de mentira. */
import type { DB, Execution, Mission } from "@/lib/types";
import { allNavFor } from "@/components/app/nav";

const READ_TOOLS = new Set([
  "crm.search_contacts",
  "messages.search",
  "knowledge.search",
  "analytics.query",
  "calendar.list_events",
  "intelligence.ask",
  "helena.briefing",
  "helena.council",
  "helena.crisis",
  "helena.health",
  "helena.replay",
  "helena.watchdog",
  "helena.verify_outcome",
  "lgpd.log_access",
]);

const OUTBOUND_TOOLS = new Set([
  "messages.send",
  "campaigns.start",
  "campaigns.create",
  "operations.start",
  "rpa.run_shift",
  "rpa.first_mission",
  "prospect.scan_maps",
  "sales.send_proposal",
  "dev.build_presence",
]);

export function autonomyBlocksTool(db: DB, name: string) {
  const level = db.autonomyLevel || 3;
  if (READ_TOOLS.has(name)) return false;
  if (level <= 1) return true;
  if (level === 2) return true;
  return false;
}

export function circuitBreaker(db: DB, name: string): string | null {
  if (db.killSwitchActive && OUTBOUND_TOOLS.has(name)) {
    return "Kill switch ativo: Helena não dispara ação externa.";
  }
  const failed = (db.rpaJobs || []).filter((j) => j.status === "failed").length;
  if (failed >= 3 && (name === "rpa.run_shift" || name === "rpa.first_mission")) {
    return `Circuit breaker: ${failed} tarefas RPA com falha. Reprocesse uma a uma em Central RPA — sem lote novo.`;
  }
  const wa = db.connections.filter((c) => /whatsapp/i.test(`${c.name} ${c.type}`));
  const waDown = wa.length > 0 && wa.every((c) => c.status !== "online");
  if (waDown && (name === "messages.send" || name === "campaigns.start" || name === "sales.send_proposal")) {
    return "Circuit breaker: WhatsApp da operação não está online. Nada enviado.";
  }
  return null;
}

export function integrationHealth(db: DB) {
  const wa = db.connections.map((c) => ({
    name: c.name,
    status: c.status,
    sentToday: c.sentToday,
    queue: c.queue,
  }));
  const jobs = db.rpaJobs || [];
  const failed = jobs.filter((j) => j.status === "failed").length;
  const queued = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const open = Boolean(circuitBreaker(db, "rpa.run_shift") || circuitBreaker(db, "messages.send"));
  return {
    killSwitch: db.killSwitchActive,
    circuitOpen: open,
    whatsapp: wa,
    rpa: { failed, queued, total: jobs.length },
    pendingApprovals: db.approvals.filter((a) => a.status === "pendente").length,
    note: "Contagens desta organização. Credenciais nunca aparecem aqui.",
  };
}

export function agentBenchmark(db: DB) {
  const by = new Map<string, { actor: string; ok: number; fail: number; ms: number }>();
  for (const e of db.executions || []) {
    if (e.actorType !== "agent" && e.actorType !== "helena") continue;
    const cur = by.get(e.actor) || { actor: e.actor, ok: 0, fail: 0, ms: 0 };
    if (e.result === "sucesso") cur.ok += 1;
    else if (e.result === "falha") cur.fail += 1;
    cur.ms += e.durationMs || 0;
    by.set(e.actor, cur);
  }
  return [...by.values()]
    .map((r) => {
      const n = r.ok + r.fail;
      return {
        actor: r.actor,
        n,
        ok: r.ok,
        fail: r.fail,
        errorRate: n ? Math.round((r.fail / n) * 100) : 0,
        avgMs: n ? Math.round(r.ms / n) : 0,
      };
    })
    .sort((a, b) => b.n - a.n);
}

export function replayMission(db: DB, missionId: string) {
  const mission = (db.missions || []).find((m) => m.id === missionId);
  if (!mission) return null;
  const tasks = (db.missionTasks || []).filter((t) => t.missionId === missionId);
  const events = (db.missionEvents || []).filter((e) => e.missionId === missionId).slice().reverse();
  const since = mission.startedAt || mission.createdAt;
  const execs = (db.executions || []).filter((e) => e.at >= since).slice(0, 40);
  return { mission, tasks, events, execs };
}

export function screenContextLine(path: string, label: string) {
  if (!path) return "";
  return `Tela atual autorizada: ${label || path} (${path}). Só dados desta organização.`;
}

export function navLabelForPath(path: string, isAdmin: boolean, allowDev: boolean) {
  const hit = allNavFor(isAdmin, allowDev).find((n) => path.startsWith(n.to as string));
  return hit?.label || path;
}

export function executionLineage(exec: Execution) {
  return {
    at: exec.at,
    actor: exec.actor,
    action: exec.action,
    result: exec.result,
    requestedBy: exec.requestedBy,
    approvedBy: exec.approvedBy,
    error: exec.error,
  };
}

export function missionReplayText(row: NonNullable<ReturnType<typeof replayMission>>) {
  const m: Mission = row.mission;
  const ev = row.events.map((e) => `${e.at} · ${e.actor}: ${e.text}`).join("\n");
  const ex = row.execs.map((e) => `${e.at} · ${e.action} · ${e.result}`).join("\n");
  return `Replay ${m.code} (${m.status}). Objetivo: ${m.objective}\nTarefas: ${row.tasks.map((t) => `${t.title}=${t.status}`).join("; ")}\nEventos:\n${ev || "nenhum"}\nExecuções desde o início:\n${ex || "nenhuma"}`;
}
