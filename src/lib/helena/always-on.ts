/** O que continua com o navegador fechado — só o que o worker do Render já faz. */
import type { DB } from "@/lib/types";
import { nowISO, uid, update } from "@/lib/store";

export function alwaysOnTruth() {
  return {
    withBrowserClosed: [
      "Disparo WhatsApp já enfileirado no worker do Render (Evolution).",
      "Retomada da sessão WhatsApp no boot do servidor, se houver creds no disco.",
      "Fila Postgres `rpa_jobs` vencida, quando o ciclo estiver gravado.",
      "Tick comercial 24/7: Pipeline acompanha abordagem + follow-up pós ✓✓ azul (sales-flow no Render).",
      "Radar dia/noite da campanha mensal (food à noite · outros nichos de dia), quando o ciclo estiver gravado.",
    ],
    needsPanel: [
      "Planejar missão, dossiê, conselho e briefing (store do painel).",
      "Ligar a campanha mensal na Helena (ex.: “meta 3 mil no mês”).",
      "Aprovar prévia de site antes do envio (admin).",
    ],
    note: "Always-on = Render + Postgres. Meta R$ 3 mil/mês: noite food, dia outros nichos — Pipeline e follow-up sem a aba aberta.",
  };
}

export function watchdogScan(db: DB) {
  const alerts: { code: string; detail: string }[] = [];
  const failed = (db.rpaJobs || []).filter((j) => j.status === "failed");
  if (failed.length >= 3) alerts.push({ code: "rpa_failed", detail: `${failed.length} tarefas RPA com falha.` });
  const stuck = (db.rpaJobs || []).filter((j) => j.status === "running" && Date.now() - new Date(j.runAt).getTime() > 30 * 60_000);
  if (stuck.length) alerts.push({ code: "rpa_stuck", detail: `${stuck.length} job(s) em running há mais de 30 min.` });
  const staleMission = (db.missions || []).filter((m) => {
    if (m.status !== "running" || !m.startedAt) return false;
    const last = (db.missionEvents || []).find((e) => e.missionId === m.id);
    const t = new Date(last?.at || m.startedAt).getTime();
    return Date.now() - t > 45 * 60_000;
  });
  if (staleMission.length) alerts.push({ code: "mission_stale", detail: `${staleMission.map((m) => m.code).join(", ")} sem evento recente.` });
  const waDown = db.connections.some((c) => /whatsapp/i.test(c.name) && c.status !== "online");
  if (waDown) alerts.push({ code: "wa_down", detail: "WhatsApp da operação não está online." });
  return alerts;
}

export function runWatchdog(db: DB) {
  const alerts = watchdogScan(db);
  if (!alerts.length) return alerts;
  const key = alerts.map((a) => a.code).join("|");
  const already = (db.executions || []).some((e) => e.action === "helena.watchdog" && e.description.includes(key) && Date.now() - new Date(e.at).getTime() < 15 * 60_000);
  if (already) return alerts;
  update((d) => {
    d.executions.unshift({
      id: uid("ex_wd_"),
      organizationId: d.organization.id,
      at: nowISO(),
      actor: "Helena",
      actorType: "helena",
      action: "helena.watchdog",
      description: `${key}: ${alerts.map((a) => a.detail).join(" ")}`,
      result: "pendente",
      requestedBy: "watchdog",
      durationMs: 8,
    });
  });
  return alerts;
}

export function verifySendOutcome(db: DB, descriptionHint: string) {
  const hit = (db.executions || []).find((e) => e.action === "messages.send" && e.description.includes(descriptionHint));
  if (!hit) return { ok: false as const, verified: false, reason: "Não há execução messages.send com esse rastro no cadastro." };
  if (hit.result !== "sucesso") return { ok: true as const, verified: false, reason: `Execução ${hit.id} resultou ${hit.result}. Não marcar como enviado.` };
  return { ok: true as const, verified: true, reason: `Confirmado na execução ${hit.id} (${hit.at}).` };
}
