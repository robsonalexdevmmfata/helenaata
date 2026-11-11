import { nowISO, uid, update } from "@/lib/store";
import { scheduleCyclePush } from "@/lib/persist/cycle";

/** Para tudo de massa e esfria o chip (Meta restringiu). */
export function activateWhatsAppCooldown(opts?: { hours?: number; actor?: string }) {
  const hours = Math.min(Math.max(Number(opts?.hours) || 48, 12), 168);
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  const actor = opts?.actor || "Helena";
  update((d) => {
    d.killSwitchActive = true;
    d.helenaSettings.waCoolUntil = until;
    d.campaigns.forEach((c) => {
      if (c.status === "ativa") c.status = "pausada";
    });
    d.radarSchedules.forEach((s) => {
      s.active = false;
    });
    d.missions.forEach((m) => {
      if (m.status === "running") m.status = "paused";
    });
    d.operations.forEach((o) => {
      if (o.status === "running") o.status = "paused";
    });
    (d.rpaJobs || []).forEach((j) => {
      if (j.status === "queued" || j.status === "running") {
        j.status = "skipped";
        j.error = "WhatsApp em resfriamento — lote cancelado";
      }
    });
    d.agents.forEach((a) => {
      if (a.teamId === "t_com" && a.status === "trabalhando") {
        a.status = "aguardando";
        a.currentTask = "WhatsApp em resfriamento — sem disparo em massa";
      }
    });
    const team = d.teams.find((t) => t.id === "t_com");
    if (team) team.status = "pausado";
    d.executions.unshift({
      id: uid("ex_cool_"),
      organizationId: d.organization.id,
      at: nowISO(),
      actor,
      actorType: "helena",
      action: "whatsapp.cooldown",
      description: `Chip em resfriamento até ${new Date(until).toLocaleString("pt-BR")}. Campanhas/radar/missões pausados. Kill switch ligado.`,
      result: "sucesso",
      requestedBy: actor,
      durationMs: 0,
    });
  });
  scheduleCyclePush();
  return { until, hours };
}

export function clearWhatsAppCooldown(actor = "Helena") {
  update((d) => {
    d.killSwitchActive = false;
    d.helenaSettings.waCoolUntil = undefined;
    d.executions.unshift({
      id: uid("ex_cool_"),
      organizationId: d.organization.id,
      at: nowISO(),
      actor,
      actorType: "helena",
      action: "whatsapp.cooldown_clear",
      description: "Resfriamento liberado. Volte com cadência lenta (antiban).",
      result: "sucesso",
      requestedBy: actor,
      durationMs: 0,
    });
  });
  scheduleCyclePush();
}
