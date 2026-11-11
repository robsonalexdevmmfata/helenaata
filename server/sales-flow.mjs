/**
 * Comercial 24/7 no Render — sem o painel aberto.
 * Lê workspace_snapshots, avança Pipeline conforme a abordagem e
 * enfileira follow-up WhatsApp quando o lead visualizou (✓✓) e não respondeu.
 */
import { enqueueRpaJob } from "./rpa-queue.mjs";
import { listRecentWorkspaceSnapshots, patchWorkspaceSnapshot } from "./helena-db.mjs";

const HOUR = 3_600_000;
const READ_WAIT_H = 2;
const STAGE_RANK = { st_novo: 0, st_qual: 1, st_prop: 2, st_reun: 3, st_neg: 4, st_ganho: 5 };

function nowISO() {
  return new Date().toISOString();
}

function advanceDeal(deal, event) {
  if (!deal || deal.status !== "aberto") return false;
  const target =
    event === "negociando" ? "st_neg"
      : event === "reuniao" ? "st_reun"
        : event === "ganho" ? "st_ganho"
          : "st_prop";
  const cur = STAGE_RANK[deal.stageId] ?? 0;
  const next = STAGE_RANK[target] ?? 2;
  if (cur > next) return false;
  if (cur === next && deal.stageId === target) {
    deal.updatedAt = nowISO();
    return false;
  }
  deal.stageId = target;
  deal.probability =
    target === "st_prop" ? (event === "respondeu" ? 60 : 50)
      : target === "st_reun" ? 70
        : target === "st_neg" ? 85
          : target === "st_ganho" ? 100
            : deal.probability || 30;
  deal.updatedAt = nowISO();
  if (event === "ganho") deal.status = "ganho";
  return true;
}

function isBusinessTime(d = new Date()) {
  // Campanha 24/7: dia comercial + noite food (sem madrugada 0h–7h).
  const day = d.getDay();
  if (day === 0) return false; // domingo off
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 8 && h < 24;
}

function followupText(name) {
  const n = String(name || "oi").split(/\s+/)[0] || "oi";
  return `${n}, passando pra ver se conseguiu olhar a mensagem. Qualquer dúvida é só falar.`;
}

function phoneDigits(contact, conv) {
  const raw = contact?.phone || String(conv?.remoteJid || "").replace(/@.*/, "");
  return String(raw || "").replace(/\D/g, "");
}

/**
 * Uma passagem: sync Pipeline + até 1 follow-up por conta.
 * @returns {{ orgs: number, advanced: number, queued: number }}
 */
export async function tickCommercialAlwaysOn() {
  const stats = { orgs: 0, advanced: 0, queued: 0 };
  if (!isBusinessTime()) return stats;

  const rows = await listRecentWorkspaceSnapshots(40);
  for (const row of rows) {
    const appOrg = row.appOrganizationId;
    const payload = row.payload;
    if (!appOrg || !payload || typeof payload !== "object") continue;
    stats.orgs += 1;

    const conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
    const deals = Array.isArray(payload.deals) ? payload.deals : [];
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    const connections = Array.isArray(payload.connections) ? payload.connections : [];
    const coolUntil = payload.helenaSettings?.waCoolUntil;
    const cooling = Boolean(payload.killSwitchActive || (coolUntil && Date.now() < new Date(coolUntil).getTime()));
    const waOnline = connections.some((c) => c?.status === "online");
    let changed = false;
    let queuedHere = false;

    for (const conv of conversations) {
      const flow = conv?.flow;
      if (!flow || flow.origin !== "prospeccao") continue;
      const deal = deals.find((d) => d.contactId === conv.contactId && d.status === "aberto");
      const contact = contacts.find((c) => c.id === conv.contactId);

      if (flow.state === "abordado" || flow.state === "visualizou" || flow.lastOutboundAt) {
        if (advanceDeal(deal, "abordado")) {
          changed = true;
          stats.advanced += 1;
        }
      }
      if (flow.state === "respondeu" || flow.repliedAt) {
        if (advanceDeal(deal, "respondeu")) {
          changed = true;
          stats.advanced += 1;
        }
      }
      if (flow.state === "reuniao_agendada") {
        if (advanceDeal(deal, "reuniao")) {
          changed = true;
          stats.advanced += 1;
        }
      }

      if (queuedHere || !waOnline || cooling) continue;
      if (flow.state === "esfriou" || flow.state === "reuniao_agendada" || flow.state === "respondeu") continue;
      if ((flow.closerAttempts || 0) >= 1) continue;
      if (!flow.readAt || !flow.lastOutboundAt) continue;
      if (flow.repliedAt && new Date(flow.repliedAt) >= new Date(flow.lastOutboundAt)) continue;
      if (new Date(flow.readAt) < new Date(flow.lastOutboundAt)) continue;
      const due = new Date(flow.readAt).getTime() + READ_WAIT_H * HOUR;
      if (Date.now() < due) continue;

      const phone = phoneDigits(contact, conv);
      if (phone.length < 10) continue;
      const text = followupText(contact?.name);
      const enq = enqueueRpaJob({
        instance: payload.evolutionInstance || "helena",
        number: phone,
        text,
        delayMs: 90_000,
      });
      if (!enq.ok) continue;

      flow.state = "closer";
      flow.closerAttempts = (flow.closerAttempts || 0) + 1;
      flow.lastOutboundAt = nowISO();
      flow.closerSince = flow.closerSince || nowISO();
      if (deal) {
        advanceDeal(deal, "abordado");
        deal.ownerType = "agent";
      }
      changed = true;
      queuedHere = true;
      stats.queued += 1;
    }

    if (changed) {
      await patchWorkspaceSnapshot(appOrg, () => ({
        ...payload,
        conversations,
        deals,
        contacts,
        connections,
      }));
    }
  }

  return stats;
}
