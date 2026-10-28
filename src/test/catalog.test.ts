import { describe, expect, it } from "vitest";
import { buildCatalogOpening, formatCatalogForAgents, formatOfferPrice, liveServiceOffers } from "@/lib/catalog";
import { createSeed } from "@/lib/seed";

describe("catálogo de orçamentos", () => {
  it("inclui landing, site e ofertas de IA com preço editável", () => {
    const offers = liveServiceOffers("org");
    expect(offers.find((o) => o.id === "svc_landing")?.price).toBe(497);
    expect(offers.find((o) => o.id === "svc_site")?.price).toBe(897);
    expect(offers.some((o) => /Lead Hunter/i.test(o.name))).toBe(true);
    expect(formatOfferPrice(offers.find((o) => o.id === "svc_atendente")!)).toMatch(/mês/);
  });

  it("abertura cita preço do catálogo e seed traz prompts de SDR", () => {
    const db = createSeed();
    expect(db.serviceOffers.length).toBeGreaterThan(10);
    expect(formatCatalogForAgents(db.serviceOffers)).toContain("Landing Page");
    const opening = buildCatalogOpening("Maria", "Clínica Sol", db.serviceOffers);
    expect(opening).toMatch(/Robson Alex/);
    expect(opening).toMatch(/497|landing/i);
    expect(db.agents.find((a) => a.id === "a_sdr1")?.prompt).toMatch(/persuasivo/i);
    expect(db.agents.find((a) => a.id === "a_sdr2")?.prompt).toMatch(/SDR 02/);
  });
});
