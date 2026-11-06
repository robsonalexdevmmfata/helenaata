import { describe, expect, it } from "vitest";
import { interpret } from "@/lib/helena/orchestrator";
import { runTool } from "@/lib/helena/engine";
import { getDB } from "@/lib/store";
import { buildSitePreview, enrichPreviewMedia, isFoodNiche, isPresenceIntent, isServiceBusiness, previewUrl, PUBLIC_SITE_ORIGIN, resolvePreviewKind, wantsCardapio } from "@/lib/dev/presence";
import { resolveNicheProduct } from "@/lib/dev/nicheProduct";

describe("Time Desenvolvimento IA", () => {
  it("reconhece pedido de restaurante sem site e sem cardápio", () => {
    expect(isPresenceIntent("Helena, procure 50 restaurantes que não tenham site nem cardápio online")).toBe(true);
    expect(isFoodNiche("Restaurantes")).toBe(true);
    expect(wantsCardapio("Lanchonetes")).toBe(true);
    expect(wantsCardapio("Pizzarias")).toBe(true);
    expect(wantsCardapio("Sorveterias")).toBe(false);
    expect(wantsCardapio("Açaí do Parque")).toBe(false);
    expect(wantsCardapio("Padaria Central")).toBe(false);
    expect(isPresenceIntent("ative o time comercial e comece a prospectar clientes")).toBe(false);
    expect(isPresenceIntent("ative o rpa e faça 1000 leads no brasil com cardápio e time market")).toBe(false);
    expect(isPresenceIntent("prospectar diversos nichos no brasil e ativar time comercial")).toBe(false);
  });

  it("sorveteria ganha site, nunca cardápio de restaurante", () => {
    expect(resolvePreviewKind("Sorveteria Gelato", "Restaurantes")).toEqual({ food: false, segment: "Sorveterias" });
    const preview = buildSitePreview({
      organizationId: "o1",
      companyId: "c1",
      contactId: "p1",
      place: { name: "Sorveteria Gelato", phone: "+55 11 98888-0000", city: "Campinas, SP", address: "Centro", contactName: "Ana", rating: 4.6, reviewCount: 40 },
      segment: "Restaurantes",
      slug: "sorveteria-gelato",
    });
    expect(preview.menu).toBeUndefined();
    expect(preview.services?.some((s) => /sabor/i.test(s.name))).toBe(true);
    expect(preview.tagline).not.toMatch(/cardápio/i);
    expect(preview.segment).toBe("Sorveterias");
  });

  it("cada nicho resolve um produto visual distinto", () => {
    expect(resolveNicheProduct("Chaveiro 24h", "Restaurantes").family).toBe("trade");
    expect(resolveNicheProduct("Barbearia Dom", "Barbearias").family).toBe("beauty");
    expect(resolveNicheProduct("Clínica Sorriso", "Dentistas").family).toBe("clinic");
    expect(resolveNicheProduct("Sorveteria Gelato", "Restaurantes").family).toBe("sweet");
    expect(resolveNicheProduct("Cantina Nonno", "Restaurantes").family).toBe("delivery");
    expect(resolveNicheProduct("Almeida Advogados", "Advogados").family).toBe("pro");
    expect(resolveNicheProduct("Chaveiro 24h", "x").cta).toMatch(/chaveiro|Chamar/i);
  });

  it("chaveiro nunca vira cardápio mesmo com segmento Restaurantes", () => {
    expect(isServiceBusiness("Chaveiro 24h")).toBe(true);
    expect(isFoodNiche("Chaveiro")).toBe(false);
    expect(resolvePreviewKind("Chaveiro", "Restaurantes")).toEqual({ food: false, segment: "Chaveiros" });
    const preview = buildSitePreview({
      organizationId: "o1",
      companyId: "c1",
      contactId: "p1",
      place: { name: "Chaveiro", phone: "+55 21 99999-0000", city: "Rio de Janeiro, RJ", address: "Centro", contactName: "João", rating: 4.3, reviewCount: 71 },
      segment: "Restaurantes",
      slug: "chaveiro",
    });
    expect(preview.menu).toBeUndefined();
    expect(preview.services?.length).toBeGreaterThan(0);
    expect(preview.segment).toBe("Chaveiros");
    expect(preview.tagline).not.toMatch(/cardápio/i);
    const fixed = enrichPreviewMedia({
      ...preview,
      segment: "Restaurantes",
      menu: [{ category: "Pratos", items: [{ name: "Moqueca", description: "x", price: 10 }] }],
      tagline: "Chaveiro: nota 4.3 em Rio de Janeiro, RJ — cardápio e pedido no WhatsApp.",
    });
    expect(fixed.menu).toBeUndefined();
    expect(fixed.segment).toBe("Chaveiros");
    expect(fixed.tagline).not.toMatch(/cardápio/i);
  });

  it("Helena aciona o time Dev e o comercial recebe o link", () => {
    const replies = interpret("Helena, procure 10 restaurantes que não tenham site nem cardápio online");
    expect(replies[0]!.text.toLowerCase()).toMatch(/desenvolvimento|prévia|cardápio|comercial/);
    expect(replies[0]!.card).toBeDefined();
  });

  it("gera prévias com cardápio, slug e mensagem para o dono", () => {
    const before = getDB().sitePreviews?.length ?? 0;
    const res = runTool(
      "dev.build_presence",
      { segment: "Restaurantes", city: "Campinas, SP", limit: 3 },
      { actor: "Helena", actorType: "helena", requestedBy: "admin" },
    );
    expect(res.ok).toBe(true);
    const db = getDB();
    expect(db.sitePreviews.length).toBe(before + 3);
    expect(db.teams.some((t) => t.id === "t_dev")).toBe(true);
    expect(db.agents.filter((a) => a.teamId === "t_dev")).toHaveLength(3);
    const prev = db.sitePreviews[0]!;
    expect(prev.menu?.length).toBeGreaterThan(0);
    expect(prev.menu?.[0]?.items?.[0]?.image).toMatch(/^https:\/\//);
    expect(prev.photos.length).toBeGreaterThanOrEqual(6);
    expect(prev.previewPath).toMatch(/^\/v\//);
    const conv = db.conversations.find((c) => c.contactId === prev.contactId);
    expect(conv?.status).toBe("pendente");
    expect(conv?.messages[0]?.kind).toBe("event");
    expect(conv?.messages[0]?.text).toMatch(/prévia|aguardando envio/i);
    expect(conv?.messages[0]?.text).toContain(previewUrl(prev.slug));
    expect(previewUrl(prev.slug)).toMatch(/^https:\/\/helenaata\.vercel\.app\/v\//);
    expect(PUBLIC_SITE_ORIGIN).toBe("https://helenaata.vercel.app");
    expect(db.contacts.find((c) => c.id === prev.contactId)?.tags).toEqual(
      expect.arrayContaining(["#sem-site", "#sem-cardapio"]),
    );
  });

  it("enriquece prévia antiga de moqueca com fotos e pratos", () => {
    const rich = enrichPreviewMedia({
      id: "prev_t",
      organizationId: "o1",
      slug: "casa-da-moqueca",
      companyId: "c1",
      contactId: "p1",
      name: "Casa da Moqueca",
      segment: "Restaurantes",
      city: "Balneário Camboriú",
      address: "BC",
      phone: "+55 11 90000-0000",
      rating: 4.5,
      reviewCount: 20,
      reviews: [],
      hours: "11–22",
      tagline: "x",
      about: "y",
      palette: { bg: "#1c1410", fg: "#f7efe6", accent: "#e07a3d" },
      photos: ["https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80"],
      menu: [
        {
          category: "Pratos",
          items: [{ name: "Especial da casa", description: "genérico", price: 55 }],
        },
      ],
      mapsUrl: "https://maps.google.com",
      previewPath: "/v/casa-da-moqueca",
      status: "enviada",
      createdBy: "test",
      createdAt: new Date().toISOString(),
    });
    expect(rich.photos.length).toBeGreaterThanOrEqual(6);
    expect(rich.menu?.some((c) => /moqueca/i.test(c.category) || c.items.some((i) => /moqueca/i.test(i.name)))).toBe(true);
    expect(rich.menu?.every((c) => c.items.every((i) => Boolean(i.image)))).toBe(true);
  });

  it("nicho sem comida gera site de serviços, não cardápio", () => {
    const res = runTool(
      "dev.build_presence",
      { segment: "Advogados", city: "Bauru, SP", limit: 1 },
      { actor: "Helena", actorType: "helena", requestedBy: "admin" },
    );
    expect(res.ok).toBe(true);
    const prev = getDB().sitePreviews.find((p) => p.segment === "Advogados");
    expect(prev?.menu).toBeUndefined();
    expect(prev?.services?.length).toBeGreaterThan(0);
  });
});
