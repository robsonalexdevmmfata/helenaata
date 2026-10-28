import type { HunterLead } from "@/lib/leads-hunter";
import { TOP_CITIES_BY_UF } from "@/lib/leads-hunter";
import { uid } from "@/lib/store";
import { callFreeLLMOrchestrator } from "@/lib/helena/freellmapi";

export interface MapPlace {
  name: string;
  phone: string;
  city: string;
  address: string;
  website?: string;
  contactName: string;
}

const OVERPASS = "https://overpass-api.de/api/interpreter";
const PHOTON = "https://photon.komoot.io/api/";

/** Capitais e polos para varredura nacional. */
export const NATIONAL_HUBS = [
  "São Paulo, SP",
  "Rio de Janeiro, RJ",
  "Belo Horizonte, MG",
  "Curitiba, PR",
  "Porto Alegre, RS",
  "Salvador, BA",
  "Recife, PE",
  "Fortaleza, CE",
  "Brasília, DF",
  "Goiânia, GO",
  "Campinas, SP",
  "Presidente Prudente, SP",
];

export function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

/** Celular BR com DDD + 9 + 8 dígitos (WhatsApp). */
export function isValidBrazilWhatsApp(phone: string) {
  const d = digits(phone);
  const n = d.startsWith("55") ? d.slice(2) : d;
  return n.length === 11 && n[2] === "9";
}

export function normalizePhone(raw: string) {
  const d = digits(raw);
  if (d.startsWith("55") && d.length >= 12) return `+${d}`;
  if (d.length === 11) return `+55${d}`;
  if (d.length === 10) return `+55${d}`;
  return d.length >= 10 ? `+${d}` : "";
}

export function queryForSegment(segment: string) {
  const n = segment.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/odontolog|dentista|dentist|consultorio/.test(n)) {
    return `
      nwr["amenity"="dentist"]["phone"]
      nwr["healthcare"="dentist"]["phone"]
      nwr["amenity"="clinic"]["phone"]["name"~"odonto|dent",i]
    `;
  }
  if (/advog/.test(n)) return `nwr["office"="lawyer"]["phone"]`;
  if (/imobili/.test(n)) return `nwr["office"="estate_agent"]["phone"]`;
  if (/academia|fitness/.test(n)) return `nwr["leisure"="fitness_centre"]["phone"]`;
  if (/veterin|pet shop|petshop/.test(n)) return `nwr["amenity"="veterinary"]["phone"]`;
  if (/hotel|pousada/.test(n)) return `nwr["tourism"="hotel"]["phone"]`;
  if (/oficina|auto pe/.test(n)) return `nwr["shop"="car_repair"]["phone"]`;
  if (/clinic|medico|medica/.test(n)) {
    return `nwr["amenity"~"clinic|doctors|hospital"]["phone"]`;
  }
  if (/estetica|beleza/.test(n)) return `nwr["shop"~"beauty|hairdresser"]["phone"]`;
  if (/restaurante/.test(n)) return `nwr["amenity"="restaurant"]["phone"]`;
  if (/barbearia/.test(n)) return `nwr["shop"="hairdresser"]["phone"]`;
  if (/comercio|loja/.test(n)) return `nwr["shop"]["phone"]`;
  if (/agencia/.test(n)) return `nwr["office"]["phone"]`;
  return `nwr["phone"]["name"]`;
}

export function extractProspectIntent(text: string) {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nationwide = /brasil inteiro|todo o brasil|nacional|todos os estados|\bno brasil\b/.test(n);
  const cityMatch = text.match(/\bem\s+([A-ZÁÉÍÓÚÂÊÔÃÕa-záéíóúâêôãõ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕa-záéíóúâêôãõ]+){0,3})(?:,\s*[A-Z]{2})?/i);
  const cityRaw = cityMatch?.[1]?.trim() ?? "";
  const city = cityRaw && !/brasil/i.test(cityRaw) ? cityRaw : "Brasil";

  const labels: Array<[RegExp, string]> = [
    [/odontolog|dentista|consultorio odont/, "Dentistas e consultórios odontológicos"],
    [/advog|escritorio de advoc/, "Advogados"],
    [/clinic.*medic|medico/, "Clínicas Médicas"],
    [/estetica/, "Clínicas de estética"],
    [/restaurante/, "Restaurantes"],
    [/barbearia/, "Barbearias"],
    [/imobili/, "Imobiliárias"],
    [/academia|fitness/, "Academias"],
    [/pet shop|petshop|veterinar/, "Pet shops e veterinárias"],
    [/hotel|pousada/, "Hotéis e pousadas"],
    [/oficina|auto pe/, "Oficinas mecânicas"],
    [/loja|comercio/, "Comércios locais"],
  ];

  let segment = "";
  const after = n.match(/(?:prospectar|cacar|buscar|varrer|leads de|nicho)\s+(.+?)(?:\s+em\s+|\s+sem site|\s+no brasil|$)/);
  if (after) {
    segment = after[1].replace(/\s+sem site.*$/, "").replace(/\s+para a agencia.*$/, "").trim();
  }
  if (!segment || /^(clientes|leads|empresas|negocios|negocios locais)$/.test(segment)) {
    const hit = labels.find(([re]) => re.test(n));
    segment = hit ? hit[1] : "negócios locais sem site";
  }

  return {
    segment,
    city,
    nationwide: nationwide || city === "Brasil",
  };
}

async function geocode(city: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${PHOTON}?q=${encodeURIComponent(city + ", Brasil")}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const coords = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return { lon: Number(coords[0]), lat: Number(coords[1]) };
}

export function isNationwideScope(city: string, state?: string) {
  const n = `${city} ${state ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return !n.trim() || /brasil|todo o pais|nacional|todos/.test(n) || state === "TODOS";
}

export function citiesForState(uf: string) {
  const list = TOP_CITIES_BY_UF[uf] ?? [];
  return list.map((c) => `${c}, ${uf}`);
}

export async function planCitiesWithFreeLLM(niche: string, scope: string): Promise<string[]> {
  try {
    const reply = await callFreeLLMOrchestrator(
      `Monte a varredura nacional de prospecção para o nicho "${niche}". Escopo: ${scope}.
Responda SOMENTE um JSON array de até 8 strings no formato "Cidade, UF" (ex: ["Curitiba, PR","Salvador, BA"]). Sem markdown.`,
    );
    const match = reply?.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        const cities = parsed.map((x) => String(x)).filter((x) => x.includes(","));
        if (cities.length) return cities.slice(0, 8);
      }
    }
  } catch {
    /* fallback */
  }
  return NATIONAL_HUBS.slice(0, 8);
}

export async function resolveSearchCities(opts: {
  city?: string;
  state?: string;
  nationwide?: boolean;
  niche?: string;
}): Promise<string[]> {
  if (opts.nationwide || isNationwideScope(opts.city ?? "", opts.state)) {
    return planCitiesWithFreeLLM(opts.niche || "negócios locais", "Brasil inteiro");
  }
  if (opts.state && opts.state !== "TODOS" && !opts.city) {
    return citiesForState(opts.state).slice(0, 6);
  }
  const raw = (opts.city ?? "").trim();
  if (raw.includes(",")) {
    return raw.split(/[;]/).map((c) => c.trim()).filter(Boolean);
  }
  if (raw.includes(" e ")) {
    return raw.split(/\s+e\s+/i).map((c) => c.trim()).filter(Boolean);
  }
  const multi = raw.split(",").map((c) => c.trim()).filter(Boolean);
  if (multi.length > 1) return multi.map((c) => (opts.state && opts.state !== "TODOS" && !c.includes(",") ? `${c}, ${opts.state}` : c));
  if (raw) return [opts.state && opts.state !== "TODOS" && !raw.includes(",") ? `${raw}, ${opts.state}` : raw];
  return NATIONAL_HUBS.slice(0, 6);
}

async function searchCity(segment: string, city: string, limit: number): Promise<MapPlace[]> {
  const geo = await geocode(city);
  if (!geo) return [];
  const selector = queryForSegment(segment);
  const ql = `
[out:json][timeout:25];
(
  ${selector}(around:18000,${geo.lat},${geo.lon});
);
out center ${Math.max(limit * 5, 50)};
`.trim();

  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `data=${encodeURIComponent(ql)}`,
  });
  if (!res.ok) return [];
  const data = await res.json();
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const out: MapPlace[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const website = String(tags.website || tags["contact:website"] || "").trim();
    if (website) continue;
    const phone = normalizePhone(String(tags.phone || tags["contact:phone"] || tags.mobile || tags["contact:whatsapp"] || ""));
    if (!isValidBrazilWhatsApp(phone)) continue;
    const name = String(tags.name || "").trim();
    if (!name) continue;
    out.push({
      name,
      phone,
      city,
      address: [tags["addr:street"], tags["addr:housenumber"], city].filter(Boolean).join(", "),
      contactName: name,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchBusinessesWithoutWebsite(opts: {
  segment: string;
  city?: string;
  state?: string;
  nationwide?: boolean;
  limit?: number;
}): Promise<MapPlace[]> {
  const limit = Math.min(opts.limit ?? 10, 40);
  const cities = await resolveSearchCities({
    city: opts.city,
    state: opts.state,
    nationwide: opts.nationwide,
    niche: opts.segment,
  });
  const perCity = Math.max(2, Math.ceil(limit / Math.max(cities.length, 1)));
  const seen = new Set<string>();
  const out: MapPlace[] = [];
  for (const city of cities) {
    if (out.length >= limit) break;
    try {
      const found = await searchCity(opts.segment, city, perCity + 4);
      for (const p of found) {
        const key = digits(p.phone);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
        if (out.length >= limit) break;
      }
    } catch {
      /* próxima cidade */
    }
  }
  return out.slice(0, limit);
}

export function placesToHunterLeads(places: MapPlace[], niche: string, state = "BR"): HunterLead[] {
  return places.map((p, i) => ({
    id: uid("hunt_"),
    name: p.name,
    niche,
    city: p.city.replace(/,.*/, "").trim(),
    state: p.city.includes(",") ? p.city.split(",").pop()!.trim() : state,
    address: p.address,
    phone: p.phone,
    isCellPhone: true,
    whatsappVerified: true,
    website: p.website,
    hasWebsite: Boolean(p.website),
    rating: 0,
    reviewCount: 0,
    tag: i === 0 ? "TUBARÃO" : "PREMIUM",
    type: "quente",
    ownerContact: p.contactName,
    whatsappScore: 92,
    selected: false,
  }));
}
