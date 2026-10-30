import { describe, expect, it } from "vitest";
import { isHelenaArrivalGreeting } from "@/lib/helena/briefing";
import { extractProspectIntent } from "@/lib/prospect/mapsSearch";

describe("saudação de entrada da Helena", () => {
  it("reconhece cheguei e bom dia", () => {
    expect(isHelenaArrivalGreeting("Olá Helena, cheguei")).toBe(true);
    expect(isHelenaArrivalGreeting("bom dia")).toBe(true);
    expect(isHelenaArrivalGreeting("Bom dia Helena")).toBe(true);
    expect(isHelenaArrivalGreeting("olá helena")).toBe(true);
  });

  it("não intercepta pedido de prospecção", () => {
    expect(
      isHelenaArrivalGreeting(
        "Boa noite Helena. Preciso que você ative o time comercial e comece a prospectar clientes",
      ),
    ).toBe(false);
  });
});

describe("extractProspectIntent", () => {
  it("não assume dentista quando o nicho é outro", () => {
    const adv = extractProspectIntent("Helena, prospectar advogados em Campinas");
    expect(adv.segment.toLowerCase()).toMatch(/advog/);
    expect(adv.city.toLowerCase()).toMatch(/campinas/);
    expect(adv.nationwide).toBe(false);

    const gen = extractProspectIntent("ative o time comercial e comece a prospectar clientes");
    expect(gen.segment.toLowerCase()).not.toMatch(/dentista/);
    expect(gen.nationwide).toBe(true);

    const sp = extractProspectIntent(
      "prospecte 3 consultórios odontológicos em São Paulo sem site, só leads quentes com WhatsApp",
    );
    expect(sp.city.toLowerCase()).toBe("são paulo");
    expect(sp.nationwide).toBe(false);
    expect(sp.segment.toLowerCase()).toMatch(/odontolog|dentista/);
  });
});
