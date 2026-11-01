import { dueRpaJobs, markRpaJob } from "./helena-db.mjs";

async function dispatchJob(payload) {
  const evo = String(process.env.EVOLUTION_URL || process.env.VITE_EVOLUTION_URL || "").replace(/\/$/, "");
  const key = process.env.EVOLUTION_KEY || process.env.VITE_EVOLUTION_KEY || "";
  if (!evo || !key) {
    return { status: "skipped", error: "Evolution sem URL/KEY no servidor" };
  }

  try {
    const res = await fetch(`${evo}/message/sendText/${payload.instance || "helena"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        number: String(payload.number || "").replace(/\D/g, ""),
        text: String(payload.text || ""),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok
      ? { status: "sent" }
      : { status: "failed", error: `HTTP ${res.status}` };
  } catch (error) {
    return { status: "failed", error: error?.message || String(error) };
  }
}

export async function tickRpaQueue() {
  const due = await dueRpaJobs(1);
  for (const row of due) {
    const result = await dispatchJob(row.payload || {});
    await markRpaJob(row.id, result.status, result.error);
  }
  return due;
}
