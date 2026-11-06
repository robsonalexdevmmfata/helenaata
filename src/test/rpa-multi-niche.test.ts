import { describe, expect, it } from "vitest";
import { interpret } from "@/lib/helena/orchestrator";
import { WAVE_NICHES } from "@/lib/prospect/mapsSearch";

describe("RPA diversos nichos", () => {
  it("expõe grade ampla de nichos na onda", () => {
    expect(WAVE_NICHES.length).toBeGreaterThanOrEqual(12);
    expect(WAVE_NICHES).toEqual(expect.arrayContaining(["Advogados", "Restaurantes", "Dentistas", "Pet shops"]));
  });

  it("Helena entende pedido de RPA multi-nicho", () => {
    const replies = interpret("eu quero rpa diversos nichos");
    const text = replies.map((r) => `${r.text} ${JSON.stringify(r.card || {})}`).join(" ").toLowerCase();
    expect(text).toMatch(/rpa|multi-nicho|diversos nichos|onda|aprovac/);
    const card = replies.find((r) => r.card)?.card as { type?: string; rows?: { label: string; value: string }[]; title?: string } | undefined;
    expect(card).toBeTruthy();
    if (card?.type === "result" || card?.type === "approval") {
      expect(`${card.title || ""} ${JSON.stringify(card)}`.toLowerCase()).toMatch(/rpa|nicho|multi|maps|aprov/);
    }
  });
});
