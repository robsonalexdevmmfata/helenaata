import { describe, expect, it } from "vitest";
import { interpret } from "@/lib/helena/orchestrator";
import { runTool } from "@/lib/helena/engine";
import { getDB } from "@/lib/store";
import { isFoodNiche, isPresenceIntent } from "@/lib/dev/presence";

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
    expect(prev.previewPath).toMatch(/^\/v\//);
    const conv = db.conversations.find((c) => c.contactId === prev.contactId);
    expect(conv?.messages[0]?.text).toMatch(/prévia|proprietár/i);
    expect(conv?.messages[0]?.text).toContain(prev.previewPath);
    expect(db.contacts.find((c) => c.id === prev.contactId)?.tags).toEqual(
      expect.arrayContaining(["#sem-site", "#sem-cardapio"]),
    );
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
