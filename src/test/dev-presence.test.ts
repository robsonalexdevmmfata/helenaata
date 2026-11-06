import { describe, expect, it } from "vitest";
import { interpret } from "@/lib/helena/orchestrator";
import { runTool } from "@/lib/helena/engine";
import { getDB } from "@/lib/store";
import { enrichPreviewMedia, isFoodNiche, isPresenceIntent, previewUrl, PUBLIC_SITE_ORIGIN } from "@/lib/dev/presence";

describe("Time Desenvolvimento IA", () => {
  it("reconhece pedido de restaurante sem site e sem cardápio", () => {
    expect(isPresenceIntent("Helena, procure 50 restaurantes que não tenham site nem cardápio online")).toBe(true);
    expect(isFoodNiche("Restaurantes")).toBe(true);
    expect(isPresenceIntent("ative o time comercial e comece a prospectar clientes")).toBe(false);
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
