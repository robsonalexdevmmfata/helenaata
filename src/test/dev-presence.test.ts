import { describe, expect, it } from "vitest";
import { interpret } from "@/lib/helena/orchestrator";
import { runTool } from "@/lib/helena/engine";
import { getDB } from "@/lib/store";
import {
  buildSitePreview,
  isFoodNiche,
  isPresenceIntent,
  previewUrl,
  PUBLIC_SITE_ORIGIN,
} from "@/lib/dev/presence";

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

  it("não cria leads ou prévias fictícias quando não há resultado real do Maps", () => {
    const before = {
      contacts: getDB().contacts.length,
      companies: getDB().companies.length,
      previews: getDB().sitePreviews.length,
    };
    const res = runTool(
      "dev.build_presence",
      { segment: "Restaurantes", city: "Campinas, SP", limit: 3 },
      { actor: "Helena", actorType: "helena", requestedBy: "admin" },
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/busca real do Maps para gerar prévias não é executada em testes/i);
    const db = getDB();
    expect(db.contacts).toHaveLength(before.contacts);
    expect(db.companies).toHaveLength(before.companies);
    expect(db.sitePreviews).toHaveLength(before.previews);
  });

  it("prévia não inventa avaliações, fotos, cardápio ou serviços", () => {
    const prev = buildSitePreview({
      organizationId: "org_t",
      companyId: "c_real",
      contactId: "p_real",
      place: {
        name: "Escritório Real",
        city: "Bauru, SP",
        address: "Rua A, 10",
        phone: "+55 14 99999-1111",
        contactName: "Contato público",
      },
      segment: "Advogados",
      slug: "escritorio-real",
    });

    expect(prev.rating).toBe(0);
    expect(prev.reviewCount).toBe(0);
    expect(prev.reviews).toEqual([]);
    expect(prev.photos).toEqual([]);
    expect(prev.menu).toBeUndefined();
    expect(prev.services).toBeUndefined();
    expect(prev.previewPath).toBe("/v/escritorio-real");
    expect(previewUrl(prev.slug)).toMatch(/^https:\/\/helenaata\.vercel\.app\/v\//);
    expect(PUBLIC_SITE_ORIGIN).toBe("https://helenaata.vercel.app");
  });
});
