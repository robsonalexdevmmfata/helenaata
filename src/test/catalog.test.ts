import { describe, expect, it } from "vitest";
import { buildCatalogOpening, formatCatalogForAgents, formatOfferPrice, liveServiceOffers } from "@/lib/catalog";
import { createSeed } from "@/lib/seed";

describe("catálogo de orçamentos", () => {
  it("inclui site e cardápio a R$ 100/mês e ofertas de IA", () => {
    const offers = liveServiceOffers("org");
    expect(offers.find((o) => o.id === "svc_site")?.price).toBe(100);
    expect(offers.find((o) => o.id === "svc_site")?.billing).toBe("mensal");
    expect(offers.find((o) => o.id === "svc_cardapio")?.price).toBe(100);
    expect(offers.find((o) => o.id === "svc_landing")?.price).toBe(100);
    expect(offers.some((o) => /Lead Hunter/i.test(o.name))).toBe(true);
    expect(formatOfferPrice(offers.find((o) => o.id === "svc_site")!)).toMatch(/mês/);
  });

  it("abertura pergunta se é proprietário e seed traz prompts de SDR", () => {
    const db = createSeed();
    expect(db.serviceOffers.length).toBeGreaterThan(10);
    expect(formatCatalogForAgents(db.serviceOffers)).toContain("Landing Page");
    const opening = buildCatalogOpening("Maria", "Clínica Sol", db.serviceOffers);
    expect(opening).toMatch(/Robson Alex/);
    expect(opening).toMatch(/proprietári/i);
    expect(opening).not.toMatch(/R\$|297|547|100/);
    expect(db.agents.find((a) => a.id === "a_sdr1")?.prompt).toMatch(/proprietári/i);
    expect(db.agents.find((a) => a.id === "a_sdr2")?.prompt).toMatch(/Camila Alves/);
    expect(db.agents.find((a) => a.id === "a_sdr1")?.name).toBe("Marina Costa");
  });
});
