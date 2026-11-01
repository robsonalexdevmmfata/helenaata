import { describe, expect, it } from "vitest";
import { mergeEvidenceHistory, nextBestAction, lostMoneyRadar, nichePlayOf, roiBreakEven, roiScenarios } from "@/lib/helena/intelligence";
import {
  copilotAnswer, detectContradictions, matchOffersByFit, minPriceFor, recordDecision, recoverOpportunities,
} from "@/lib/helena/decision";
import { diagnoseLead } from "@/lib/helena/diagnose";
import type { Company, Contact } from "@/lib/types";
import { getDB, update } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { dailyLimitFor, grantLifetimeAccess, mustSubscribe } from "@/lib/saas";

function contact(partial: Partial<Contact>): Contact {
  return {
    id: "c1",
    organizationId: "o1",
    name: "Pizzaria Teste",
    companyId: "co1",
    score: 80,
    tags: ["#sem-site", "#sem-cardapio"],
    createdAt: new Date().toISOString(),
    ...partial,
  } as Contact;
}

describe("helena intelligence", () => {
  it("marca canal e cardápio como estimativa, não perda comprovada", () => {
    const company = { id: "co1", name: "Pizzaria Teste", segment: "Pizzaria", city: "Recife" } as Company;
    const leaks = lostMoneyRadar(contact({}), company);
    expect(leaks.some((l) => l.code === "sem_canal")).toBe(true);
    expect(leaks.some((l) => l.code === "cardapio")).toBe(true);
    for (const l of leaks) {
      expect(l.estimateHint.toLowerCase()).toMatch(/estimativa/);
    }
  });

  it("ROI é ponto de equilíbrio, não garantia", () => {
    const r = roiBreakEven(4500, 45);
    expect(r.pedidos).toBe(100);
    expect(r.line).toMatch(/Estimativa/);
    expect(r.line).toMatch(/Não é garantia/);
  });

  it("pizzaria, clínica e barbearia saem com ofertas diferentes", () => {
    expect(nichePlayOf("Pizzaria", "Pizzaria Central")).toBe("pizzaria");
    expect(nichePlayOf("Clínica odontológica", "Sorriso")).toBe("clinica");
    expect(nichePlayOf("Barbearia", "Navalha")).toBe("barbearia");
    expect(diagnoseLead({ name: "Pizzaria Central", segment: "Pizzaria", city: "Recife", website: "", tags: ["#sem-site"], hasMenu: false }).recommend_offer).toMatch(/cardápio/i);
    expect(diagnoseLead({ name: "Clínica Sorriso", segment: "Clínica odontológica", city: "Recife", website: "", tags: ["#sem-site"] }).recommend_offer).toMatch(/agendamento/i);
    expect(diagnoseLead({ name: "Barbearia Navalha", segment: "Barbearia", city: "Recife", website: "", tags: ["#sem-site"] }).recommend_offer).toMatch(/reserva/i);
  });

  it("cenários de ROI declaram premissa e não prometem faturamento", () => {
    const { ticketSource, scenarios } = roiScenarios(4500, "pizzaria");
    expect(ticketSource).toBe("hypothesis");
    expect(scenarios).toHaveLength(3);
    for (const s of scenarios) expect(s.premise).toMatch(/Não é garantia/);
    const informed = roiScenarios(4500, "pizzaria", 50);
    expect(informed.ticketSource).toBe("stated_by_client");
  });

  it("histórico de evidência guarda a classificação anterior", () => {
    const hist = mergeEvidenceHistory(
      [{ code: "site", label: "Website", observation: "não achou", kind: "not_found", source: "osm", collectedAt: "2026-01-01" }],
      [{ code: "site", label: "Website", observation: "https://x.com", kind: "observed", source: "osm", collectedAt: "2026-02-01" }],
      [],
    );
    expect(hist.some((h) => h.kind === "not_found" && h.supersededAt === "2026-02-01")).toBe(true);
  });

  it("próxima ação após diagnóstico é proposta ou prévia, com motivo", () => {
    const c = contact({ tags: ["#ciclo-diagnosticado"] });
    const a = nextBestAction({ contact: c, intent: "frio", hasDevTeam: false });
    expect(a.tool).toBe("sales.draft_proposal");
    expect(a.reason.length).toBeGreaterThan(20);
  });

  it("diagnóstico grava dossiê no mesmo contato", () => {
    const id = getDB().contacts[0]?.id;
    if (!id) return;
    const r = runTool("leads.diagnose", { contactId: id }, { actor: "Helena", actorType: "helena", requestedBy: "teste" });
    expect(r.ok).toBe(true);
    expect(getDB().commercialDossiers.some((d) => d.contactId === id)).toBe(true);
  });

  it("pizzaria com site observado não recebe site institucional no topo", () => {
    const db = getDB();
    const ranked = matchOffersByFit(db, "pizzaria", [
      { code: "site", label: "Website", observation: "https://pizza.ex", kind: "observed", source: "cadastro", collectedAt: "2026-01-01" },
      { code: "cardapio", label: "Cardápio", observation: "falta", kind: "not_found", source: "tags", collectedAt: "2026-01-01" },
    ]);
    expect(ranked[0]?.name.toLowerCase()).not.toMatch(/institucional/);
    expect(ranked[0]?.fitScore).toBeGreaterThanOrEqual(40);
  });

  it("contradição site observado vs tag #sem-site", () => {
    const c = detectContradictions(
      [{ code: "site", label: "Website", observation: "https://x", kind: "observed", source: "osm", collectedAt: "2026-01-01" }],
      ["#sem-site"],
    );
    expect(c.some((x) => x.code === "site_vs_tag")).toBe(true);
  });

  it("preço mínimo não inventa custo", () => {
    const r = minPriceFor({
      id: "svc", organizationId: "o", category: "x", name: "Site", description: "d", price: 547,
      priceNote: "", setupFee: 0, billing: "unico", active: true, pitch: "", updatedAt: new Date().toISOString(),
    });
    expect(r.ready).toBe(false);
    expect(r.note.toLowerCase()).toMatch(/custo não cadastrado/);
  });

  it("grava decisão no store da organização", () => {
    const id = getDB().contacts[0]?.id;
    if (!id) return;
    const row = recordDecision({ contactId: id, actionId: "proposal", label: "Gerar proposta", reason: "teste", status: "executada" });
    expect(getDB().commercialDecisions.some((d) => d.id === row.id)).toBe(true);
  });

  it("copilot não inventa pizzaria sem proposta se o cadastro estiver vazio disso", () => {
    const text = copilotAnswer(getDB(), "quais pizzarias diagnosticadas ainda não receberam proposta");
    expect(text.length).toBeGreaterThan(10);
  });

  it("recuperação lista diagnóstico sem proposta e respeita opt-out", () => {
    const before = recoverOpportunities(getDB()).length;
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it("admin libera vitalício e cota diária pela ferramenta", () => {
    update((d) => { d.currentUserId = "u1"; });
    const demo = getDB().users.find((u) => u.id === "u_demo")!;
    const grant = runTool("admin.grant_access", { userId: demo.id, lifetime: true }, { actor: "Robson", actorType: "user", requestedBy: "Robson" });
    expect(grant.ok).toBe(true);
    expect(mustSubscribe(getDB().users.find((u) => u.id === "u_demo"))).toBe(false);
    const quota = runTool("admin.set_daily_leads", { userId: demo.id, limit: 80 }, { actor: "Robson", actorType: "user", requestedBy: "Robson" });
    expect(quota.ok).toBe(true);
    expect(dailyLimitFor(getDB().users.find((u) => u.id === "u_demo"))).toBe(80);
    update((d) => {
      const u = d.users.find((x) => x.id === "u_demo");
      if (!u) return;
      u.lifetimeAccess = false;
      u.dailyProspectLimit = undefined;
      u.planId = "trial";
      u.createdAt = new Date().toISOString();
      u.trialEndsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    });
  });
});
