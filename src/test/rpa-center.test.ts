import { describe, expect, it } from "vitest";
import { getDB, nowISO, uid, update } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { enqueueRpa, retryRpaJob } from "@/lib/rpa/center";

function putContact(opts: { consent: boolean; tags?: string[] }) {
  const id = uid("p_rpa_");
  update((d) => {
    d.currentUserId = "u1";
    d.contacts.unshift({
      id,
      organizationId: d.organization.id,
      name: "Lead RPA",
      email: "lead@rpa.test",
      phone: "+55 11 99999-0001",
      title: "",
      tags: opts.tags || [],
      source: "Prospecção",
      ownerId: "u1",
      status: "lead",
      score: 80,
      consent: opts.consent,
      createdAt: nowISO(),
      lastContactAt: nowISO(),
    });
  });
  return id;
}

describe("Central RPA", () => {
  it("não enfileira a mesma tarefa duas vezes", () => {
    const a = enqueueRpa({ kind: "daily_report", idempotencyKey: "daily-test-unique", payload: {} });
    const b = enqueueRpa({ kind: "daily_report", idempotencyKey: "daily-test-unique", payload: {} });
    expect(a?.id).toBe(b?.id);
    expect(getDB().rpaJobs.filter((j) => j.idempotencyKey === "daily-test-unique")).toHaveLength(1);
  });

  it("reprocessa falha dentro do limite", () => {
    const job = enqueueRpa({ kind: "followup", idempotencyKey: "retry-test-1", payload: {} });
    expect(job).toBeTruthy();
    update((d) => {
      const j = d.rpaJobs.find((x) => x.id === job!.id);
      if (j) {
        j.status = "failed";
        j.attempts = 1;
        j.error = "HTTP 500";
      }
    });
    const r = retryRpaJob(job!.id);
    expect(r.ok).toBe(true);
    expect(getDB().rpaJobs.find((j) => j.id === job!.id)?.status).toBe("queued");
  });

  it("follow-up respeita opt-out", () => {
    const id = putContact({ consent: false, tags: ["opt-out"] });
    const r = runTool("rpa.followup_schedule", { contactId: id, kind: "preco_alto" }, { actor: "Helena", actorType: "helena" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/opt-out/i);
  });

  it("proposta nasce do diagnóstico e o envio pede aprovação", () => {
    const id = putContact({ consent: true, tags: ["#sem-site"] });
    const draft = runTool("sales.draft_proposal", { contactId: id }, { actor: "Helena", actorType: "helena" });
    expect(draft.ok).toBe(true);
    const proposalId = String(draft.data?.proposalId);
    const send = runTool("sales.send_proposal", { proposalId }, { actor: "Helena", actorType: "helena" });
    expect(send.ok).toBe(true);
    expect(send.message).toMatch(/aprovação/i);
    expect(getDB().approvals.some((a) => a.tool === "sales.send_proposal" && a.status === "pendente")).toBe(true);
  });

  it("relatório diário conta dados persistidos no store", () => {
    const r = runTool("rpa.daily_report", {}, { actor: "Helena", actorType: "helena" });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/Relatório Helena/);
    expect(getDB().dailyReports.length).toBeGreaterThan(0);
  });

  it("primeira missão agenda radar sem mudar plano", () => {
    update((d) => { d.currentUserId = "u1"; });
    const plan = getDB().users.find((u) => u.id === "u1")?.planId;
    const r = runTool(
      "rpa.first_mission",
      { nicho: "pizzaria", cidade: "Campinas", simulate: true, limit: 1 },
      { actor: "Helena", actorType: "helena" },
    );
    expect(r.ok).toBe(true);
    expect(getDB().radarSchedules.some((s) => s.segment === "pizzaria")).toBe(true);
    expect(getDB().users.find((u) => u.id === "u1")?.planId).toBe(plan);
  });
});
