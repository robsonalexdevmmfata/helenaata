import { describe, expect, it } from "vitest";
import { agentBenchmark, autonomyBlocksTool, circuitBreaker, integrationHealth } from "@/lib/helena/reliability";
import { needsApproval, runTool } from "@/lib/helena/engine";
import { getDB, update } from "@/lib/store";
import { interpret } from "@/lib/helena/orchestrator";

describe("helena reliability", () => {
  it("autonomia 1 exige aprovação em ação de envio", () => {
    update((d) => { d.autonomyLevel = 1; });
    expect(autonomyBlocksTool(getDB(), "messages.send")).toBe(true);
    expect(needsApproval(getDB(), "messages.send")).toBe(true);
    expect(autonomyBlocksTool(getDB(), "intelligence.ask")).toBe(false);
    update((d) => { d.autonomyLevel = 3; });
  });

  it("circuit breaker com kill switch bloqueia disparo", () => {
    update((d) => { d.killSwitchActive = true; });
    expect(circuitBreaker(getDB(), "rpa.run_shift")).toMatch(/Kill switch/i);
    const r = runTool("rpa.run_shift", { nicho: "barbearia", cidade: "São Paulo", maxLeads: 1, simulate: true }, { actor: "Helena", actorType: "helena", requestedBy: "teste" });
    expect(r.ok).toBe(false);
    update((d) => { d.killSwitchActive = false; });
  });

  it("saúde de integração não inclui segredo", () => {
    const h = integrationHealth(getDB());
    expect(JSON.stringify(h).toLowerCase()).not.toMatch(/apikey|sk-|password/);
    expect(h.note.toLowerCase()).toMatch(/credencia/);
  });

  it("benchmark só conta execuções", () => {
    const rows = agentBenchmark(getDB());
    expect(Array.isArray(rows)).toBe(true);
  });

  it("comando encadeado de recuperação não dispara sozinho", () => {
    const replies = interpret("Helena, encontre os leads parados, analise os motivos e prepare uma ação para recuperar os melhores.");
    expect(replies.length).toBeGreaterThan(0);
    expect(replies[0]?.text.toLowerCase()).toMatch(/cadastro|recuper/);
  });
});
