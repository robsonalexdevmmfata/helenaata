import { describe, expect, it } from "vitest";
import {
  isNationwideScope,
  isValidBrazilWhatsApp,
  normalizePhone,
  queryForSegment,
  citiesForState,
  parseCityList,
  WAVE_CITIES,
  WAVE_NICHES,
} from "@/lib/prospect/mapsSearch";
import { interpret } from "@/lib/helena/orchestrator";
import { getEvolutionConfig } from "@/lib/evolution/evolutionapi";
import { insertPlacesAsLeads } from "@/lib/prospect/runProspecting";
import { getDB } from "@/lib/store";

describe("scan_maps nacional", () => {
  it("valida WhatsApp celular BR e rejeita fixo", () => {
    expect(isValidBrazilWhatsApp("+55 18 98101-1186")).toBe(true);
    expect(isValidBrazilWhatsApp("18981011186")).toBe(true);
    expect(isValidBrazilWhatsApp("1833221100")).toBe(false);
    expect(isValidBrazilWhatsApp("5511987654321")).toBe(true);
    expect(normalizePhone("18 98101-1186")).toBe("+5518981011186");
  });

  it("reconhece Brasil inteiro e cidades por UF", () => {
    expect(isNationwideScope("Brasil")).toBe(true);
    expect(isNationwideScope("", "TODOS")).toBe(true);
    expect(isNationwideScope("Presidente Prudente, SP")).toBe(false);
    expect(citiesForState("SP")).toContain("Presidente Prudente, SP");
  });

  it("separa a onda SP + interior e vários nichos", () => {
    expect(parseCityList("São Paulo, Campinas, Andradina, Araçatuba", "SP")).toEqual([
      "São Paulo, SP",
      "Campinas, SP",
      "Andradina, SP",
      "Araçatuba, SP",
    ]);
    expect(WAVE_CITIES.join(" ")).toMatch(/Andradina/);
    expect(WAVE_NICHES.length).toBeGreaterThan(5);
  });

  it("usa Overpass de dentista para nichos odontológicos", () => {
    expect(queryForSegment("Dentistas e Consultórios Odontológicos sem site")).toContain("amenity");
    expect(queryForSegment("Dentistas e Consultórios Odontológicos sem site")).toContain("dentist");
  });

  it("Helena orquestra varredura nacional de dentistas sem site", () => {
    const replies = interpret("Helena, prospectar dentistas e consultórios odontológicos sem site");
    expect(replies.length).toBeGreaterThan(0);
    expect(replies[0]!.text.toLowerCase()).toMatch(/aprovação|varredura|odontológ|brasil|helena/);
  });

  it("Evolution usa instância helena", () => {
    expect(getEvolutionConfig().instance).toBe("helena");
  });

  it("importa só lead sem site e com WhatsApp válido", () => {
    const before = getDB().contacts.length;
    const ids = insertPlacesAsLeads(
      [
        { name: "Com site", phone: "+5511987654321", city: "São Paulo, SP", address: "", website: "https://x.com", contactName: "A" },
        { name: "Fixo", phone: "+551133221100", city: "São Paulo, SP", address: "", contactName: "B" },
        { name: "Consultório Ok", phone: "+5511981011111", city: "Campinas, SP", address: "", contactName: "Dra. Ok" },
      ],
      "Dentistas",
    );
    expect(ids).toHaveLength(1);
    expect(getDB().contacts.length).toBe(before + 1);
    expect(getDB().contacts.find((c) => c.id === ids[0])?.tags).toContain("#sem-site");
    const mapsList = getDB().lists.find((l) => l.name === "Maps · Dentistas");
    expect(mapsList?.count).toBeGreaterThanOrEqual(1);
    expect(mapsList?.source).toBe("OpenStreetMap");
    const mapsFlow = getDB().automations.find((a) => a.id === "aut_maps_sdr");
    expect(mapsFlow?.name).toMatch(/Maps/i);
    expect(mapsFlow?.runs).toBeGreaterThanOrEqual(1);
    expect(getDB().automations.some((a) => /facebook/i.test(a.name))).toBe(false);
  });
});
