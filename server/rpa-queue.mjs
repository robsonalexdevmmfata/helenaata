/**
 * Fila antiban no Render (VPS grátis do projeto).
 * Espaça disparos Evolution sem o navegador ficar aberto.
 */
const jobs = [];
let seq = 1;
const sentHour = [];

function prune(now = Date.now()) {
  while (sentHour.length && now - sentHour[0] > 3_600_000) sentHour.shift();
}

export function enqueueRpaJob({ instance, number, text, delayMs = 75_000 }) {
  const now = Date.now();
  prune(now);
  if (sentHour.length >= 8) {
    return { ok: false, error: "teto antiban 8/hora no worker" };
  }
  const id = `rpa_${seq++}`;
  const runAt = now + Math.max(60_000, Number(delayMs) || 75_000);
  jobs.push({ id, instance: instance || "helena", number: String(number).replace(/\D/g, ""), text: String(text), runAt, status: "queued" });
  if (jobs.length > 200) jobs.splice(0, jobs.length - 200);
  return { ok: true, id, runAt };
}

export function listRpaJobs() {
  prune();
  return jobs.slice(-40);
}

async function dispatchJob(job) {
  const evo = String(process.env.EVOLUTION_URL || process.env.VITE_EVOLUTION_URL || "").replace(/\/$/, "");
  const key = process.env.EVOLUTION_KEY || process.env.VITE_EVOLUTION_KEY || "";
  job.status = "running";
  try {
    if (!evo || !key) {
      job.status = "skipped";
      job.error = "Evolution sem URL/KEY no Render";
      return job;
    }
    const res = await fetch(`${evo}/message/sendText/${job.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: job.number, text: job.text }),
      signal: AbortSignal.timeout(20_000),
    });
    job.status = res.ok ? "sent" : "failed";
    if (res.ok) sentHour.push(Date.now());
    else job.error = `HTTP ${res.status}`;
  } catch (e) {
    job.status = "failed";
    job.error = e?.message || String(e);
  }
  return job;
}

export async function tickRpaQueue() {
  const now = Date.now();
  prune(now);
  const due = jobs.filter((j) => j.status === "queued" && j.runAt <= now).slice(0, 1);
  for (const job of due) await dispatchJob(job);
  try {
    const { dueRpaJobs, markRpaJob } = await import("./helena-db.mjs");
    const extra = await dueRpaJobs(due.length ? 0 : 1);
    for (const row of extra) {
      const payload = row.payload || {};
      const done = await dispatchJob({
        instance: payload.instance || "helena",
        number: String(payload.number || "").replace(/\D/g, ""),
        text: String(payload.text || ""),
        status: "queued",
      });
      await markRpaJob(row.id, done.status, done.error);
    }
  } catch {
    /* Postgres opcional */
  }
  return due;
}
