import type { HunterLead } from "@/lib/leads-hunter";
import { TOP_CITIES_BY_UF } from "@/lib/leads-hunter";
import { uid } from "@/lib/store";
import { callFreeLLMOrchestrator } from "@/lib/helena/freellmapi";
import { detectWhatsAppAiSignals, isNoWhatsAppAiIntent, type WaAiSignal } from "./waAiSignals";

export interface MapPlace {
  name: string;
  phone: string;
  city: string;
  address: string;
  website?: string;
  contactName: string;
  rating?: number;
  reviewCount?: number;
  hours?: string;
  /** URL de imagem/logo quando o mapa expõe. */
  logoUrl?: string;
  reviews?: { author: string; rating: number; text: string }[];
  /** Heurística: sem rastros públicos de chatbot/IA no atendimento. */
  likelyNoWaAi?: boolean;
  waAiReason?: string;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const PHOTON = "https://photon.komoot.io/api/";
const UA = "HelenaProspecting/1.0 (Info Tech Ltda; +https://infotech.com.br)";

/** Polo oeste/noroeste SP + capitais de demanda para a onda comercial. */
export const WAVE_CITIES = [
  "São Paulo, SP",
  "Campinas, SP",
  "Araçatuba, SP",
  "Andradina, SP",
  "Birigui, SP",
  "Penápolis, SP",
  "Bauru, SP",
  "São José do Rio Preto, SP",
];

/** Nichos da onda RPA comercial (Maps → CRM → WhatsApp). */
export const WAVE_NICHES = [
  "Dentistas",
  "Clínicas Médicas",
  "Clínicas de estética",
  "Advogados",
  "Restaurantes",
  "Pizzarias",
  "Sorveterias",
  "Açaí",
  "Lanchonetes",
  "Hamburguerias",
  "Barbearias",
  "Salões de beleza",
  "Oficinas mecânicas",
  "Chaveiros",
  "Imobiliárias",
  "Pet shops",
  "Veterinários",
  "Academias",
  "Padarias",
  "Contadores",
  "Arquitetos",
  "Fotógrafos",
  "Escolas de idiomas",
];

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
      nwr["amenity"="dentist"]
      nwr["healthcare"="dentist"]
      nwr["amenity"="clinic"]["name"~"odonto|dent|sorriso",i]
    `;
  }
  if (/advog/.test(n)) return `nwr["office"="lawyer"]`;
  if (/imobili/.test(n)) return `nwr["office"="estate_agent"]`;
  if (/academia|fitness/.test(n)) return `nwr["leisure"="fitness_centre"]`;
  if (/veterin|pet shop|petshop/.test(n)) return `nwr["amenity"="veterinary"]`;
  if (/hotel|pousada/.test(n)) return `nwr["tourism"="hotel"]`;
  if (/oficina|auto pe/.test(n)) return `nwr["shop"="car_repair"]`;
  if (/chaveir/.test(n)) return `nwr["craft"="locksmith"]\n      nwr["shop"="locksmith"]\n      nwr["name"~"chaveir",i]`;
  if (/clinic|medico|medica/.test(n)) {
    return `nwr["amenity"~"clinic|doctors|hospital"]`;
  }
  if (/estetica|beleza/.test(n)) return `nwr["shop"~"beauty|hairdresser"]`;
  if (/sorvet|sorvete|gelato|ice.?cream/.test(n)) {
    return `nwr["amenity"="ice_cream"]\n      nwr["shop"="ice_cream"]\n      nwr["name"~"sorvet|gelato",i]`;
  }
  if (/acai|açaí/.test(n)) return `nwr["amenity"="cafe"]["name"~"acai|açaí",i]\n      nwr["name"~"acai|açaí",i]`;
  if (/sushi|japones|japonesa|temaki|sashimi/.test(n)) {
    return `nwr["amenity"="restaurant"]["cuisine"~"sushi|japanese",i]\n      nwr["name"~"sushi|temaki|sashimi|japones",i]`;
  }
  if (/churrasc/.test(n)) {
    return `nwr["amenity"="restaurant"]["cuisine"~"steak|barbecue|churrasc",i]\n      nwr["name"~"churrasc",i]`;
  }
  if (/hamburgu|burger|pastel/.test(n)) {
    return `nwr["amenity"="fast_food"]\n      nwr["cuisine"~"burger|pastel",i]\n      nwr["name"~"hamburgu|burger|pastel",i]`;
  }
  if (/restaurante|pizzaria|lanchonete/.test(n)) return `nwr["amenity"="restaurant"]\n      nwr["amenity"="fast_food"]`;
  if (/padaria|cafeteria/.test(n)) return `nwr["shop"="bakery"]\n      nwr["amenity"="cafe"]`;
  if (/barbearia|salao|salão/.test(n)) return `nwr["shop"="hairdresser"]`;
  if (/contab|contador/.test(n)) return `nwr["office"="accountant"]`;
  if (/arquitet/.test(n)) return `nwr["office"="architect"]`;
  if (/fotograf/.test(n)) return `nwr["craft"="photographer"]\n      nwr["shop"="photo"]`;
  if (/idioma|ingles|english|curso/.test(n)) return `nwr["amenity"="language_school"]\n      nwr["amenity"="school"]["name"~"idioma|ingles|english",i]`;
  if (/comercio|loja/.test(n)) return `nwr["shop"]`;
  if (/agencia/.test(n)) return `nwr["office"]`;
  return `nwr["name"]["phone"]`;
}

function overpassClauses(segment: string) {
  return queryForSegment(segment)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((clause) => clause.replace(/^nwr/, "node"));
}

const CITY_ALIASES: Array<[RegExp, string]> = [
  [/adradina|andradina/, "Andradina"],
  [/balneario\s+(?:de\s+)?camboriu|bc\b/, "Balneário Camboriú"],
  [/sao\s+paulo|s[aã]o\s+paulo/, "São Paulo"],
  [/campinas/, "Campinas"],
  [/aracatuba|ara[cç]atuba/, "Araçatuba"],
];

function normalizeCityName(raw: string): string {
  const key = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const hit = CITY_ALIASES.find(([re]) => re.test(key));
  if (hit) return hit[1];
  return raw
    .split(/\s+/)
    .map((w) => (/^(de|da|do|das|dos)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Escopo de prospecção: cidade nomeada no prompt SEMPRE ganha de “Brasil / 1000 leads”. */
export function resolveProspectScope(text: string) {
  const intent = extractProspectIntent(text);
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const namedCity = Boolean(intent.city && !/^brasil$/i.test(intent.city));
  const wantsBrasilExplicit =
    /brasil\s*(inteiro|todinho|todo)|todo\s+o\s+brasil|nacional|todos\s+os\s+estados|\bno brasil\b/.test(n);
  const segKey = intent.segment.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hasSpecificNiche = !/negocios locais|sem site|empresas|clientes|^leads?$|diversos|varios nichos|leads?\s*quentes?|^por\s+\d/.test(segKey);
  const nums = [...n.matchAll(/(\d{1,4})/g)].map((m) => Number(m[1])).filter((x) => x >= 10 && x <= 1000);
  const asked = nums.find((x) => x >= 80) ?? nums[0] ?? 10;
  const multiNicheAsk =
    /diversos?\s*nichos?|varios\s*nichos?|multi[\s-]?nicho|todos?\s*os\s*nichos|onda\s*multi|\brpa\b/.test(n)
    || ((/leads?\s*quentes?|(1000|mil)\s*leads?/.test(n)) && !hasSpecificNiche);
  // Cidade explícita trava nationwide — mesmo pedindo 1000 leads.
  const nationwide = namedCity ? false : (wantsBrasilExplicit || intent.nationwide || /(1000|mil)\s*leads?/.test(n));
  const wave = multiNicheAsk || (!hasSpecificNiche && (asked >= 80 || nationwide));
  const limit = Math.min(Math.max(asked, wave ? 80 : 10), 1000);
  const city = namedCity ? intent.city : nationwide ? "Brasil" : intent.city;
  return {
    segment: wave && !hasSpecificNiche ? "diversos nichos locais" : intent.segment,
    city,
    nationwide,
    wave,
    limit,
    namedCity,
    noWhatsAppAi: intent.noWhatsAppAi,
  };
}

export function extractProspectIntent(text: string) {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nationwideAsk = /brasil inteiro|todo o brasil|nacional|todos os estados|\bno brasil\b/.test(n);
  const cityMatch = text.match(
    /\bem\s+([A-ZÁÉÍÓÚÂÊÔÃÕa-záéíóúâêôãõ]+(?:\s+(?:de|da|do|das|dos|[A-ZÁÉÍÓÚÂÊÔÃÕa-záéíóúâêôãõ]+)){0,3}(?:,\s*[A-Z]{2})?)/i,
  );
  const cityRaw = (cityMatch?.[1] ?? "")
    .replace(/\s+(sem|com|so|só|leads?|quentes?|site|whatsapp|inteligencia|inteligência|chatbot|atendente|e|para|pelo|via|sme)\b[\s\S]*$/i, "")
    .trim();
  const aliasHit = CITY_ALIASES.find(([re]) => re.test(n));
  const city =
    cityRaw && !/brasil/i.test(cityRaw)
      ? normalizeCityName(cityRaw)
      : aliasHit && !nationwideAsk
        ? aliasHit[1]
        : "Brasil";
  const namedCity = Boolean(city && !/^brasil$/i.test(city));

  const labels: Array<[RegExp, string]> = [
    [/odontolog|dentista|consultorio odont/, "Dentistas e consultórios odontológicos"],
    [/advog|escritorio de advoc/, "Advogados"],
    [/clinic|medico/, "Clínicas Médicas"],
    [/estetica/, "Clínicas de estética"],
    [/sorvet|gelato/, "Sorveterias"],
    [/acai/, "Açaí"],
    [/sushi|japones|temaki/, "Restaurantes de sushi"],
    [/churrasc/, "Churrascarias"],
    [/hamburgu|burger/, "Hamburguerias"],
    [/pastel/, "Pastelarias"],
    [/pizzaria/, "Pizzarias"],
    [/lanchonete/, "Lanchonetes"],
    [/restaurante/, "Restaurantes"],
    [/padaria|cafeteria/, "Padarias e cafeterias"],
    [/barbearia/, "Barbearias"],
    [/imobili/, "Imobiliárias"],
    [/academia|fitness/, "Academias"],
    [/pet shop|petshop|veterinar/, "Pet shops e veterinárias"],
    [/hotel|pousada/, "Hotéis e pousadas"],
    [/oficina|auto pe/, "Oficinas mecânicas"],
    [/chaveir/, "Chaveiros"],
    [/loja|comercio/, "Comércios locais"],
  ];

  let segment = "";
  const after = n.match(/(?:prospectar|cacar|buscar|procure|procurar|varrer|leads de|nicho)\s+(.+?)(?:\s+em\s+|\s+sem site|\s+no brasil|$)/);
  if (after) {
    segment = after[1]
      .replace(/^\d+\s*/, "")
      .replace(/^por\s+(\d+\s*)?/, "")
      .replace(/\s+sem site.*$/, "")
      .replace(/\s+para a agencia.*$/, "")
      .replace(/\s+quentes?\b.*$/i, "")
      .trim();
  }
  if (
    !segment
    || /^(clientes|leads|empresas|negocios|negocios locais|\d+|leads?\s*quentes?)$/.test(segment)
    || /leads?\s*quentes?/.test(segment)
  ) {
    const hit = labels.find(([re]) => re.test(n));
    segment = hit ? hit[1] : "negócios locais sem site";
  } else {
    const hit = labels.find(([re]) => re.test(segment));
    if (hit) segment = hit[1];
  }

  return {
    segment,
    city,
    // Cidade nomeada nunca vira “Brasil inteiro” só porque pediu volume alto.
    nationwide: namedCity ? false : (nationwideAsk || city === "Brasil"),
    noWhatsAppAi: isNoWhatsAppAiIntent(text),
  };
}

async function geocode(city: string): Promise<{ lat: number; lon: number } | null> {
  const q = /brasil/i.test(city) ? city : `${city}, Brasil`;
  const url = typeof window !== "undefined"
    ? `/api/maps/geocode?q=${encodeURIComponent(q)}`
    : `${PHOTON}?q=${encodeURIComponent(q)}&limit=5`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  const feats = Array.isArray(data?.features) ? data.features : [];
  const feat = feats.find((f: any) => /city|town|municipality/i.test(String(f?.properties?.type || f?.properties?.osm_value || ""))) ?? feats[0];
  const coords = feat?.geometry?.coordinates;
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
  const listed = parseCityList(raw, opts.state);
  if (listed.length) return listed;
  return NATIONAL_HUBS.slice(0, 6);
}

/** "São Paulo, Campinas, Andradina, SP" → cidades com UF. */
export function parseCityList(raw: string, state?: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const tokens = s.split(/\s*(?:,|;|\be\b)\s*/i).map((t) => t.trim()).filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (/^[A-Z]{2}$/i.test(t) && out.length) {
      const last = out[out.length - 1]!;
      if (!/,\s*[A-Z]{2}$/i.test(last)) out[out.length - 1] = `${last}, ${t.toUpperCase()}`;
    } else {
      out.push(t);
    }
  }
  return out.map((c) => {
    if (state && state !== "TODOS" && !/,\s*[A-Z]{2}$/i.test(c)) return `${c}, ${state}`;
    return c;
  });
}

function osmWebsite(tags: Record<string, unknown> = {}) {
  return String(tags.website || tags["contact:website"] || tags.url || "").trim();
}

function placeFromTags(tags: Record<string, unknown>, city: string, includeWebsites: boolean): MapPlace | null {
  if (!includeWebsites && osmHasWebsiteOrMenu(tags)) return null;
  const phone = normalizePhone(String(tags.phone || tags["contact:phone"] || tags.mobile || tags["contact:mobile"] || tags["contact:whatsapp"] || ""));
  const name = String(tags.name || "").trim();
  if (!name) return null;
  const website = osmWebsite(tags) || undefined;
  return {
    name,
    phone,
    city,
    address: [tags["addr:street"], tags["addr:housenumber"], city].filter(Boolean).join(", "),
    website,
    contactName: name,
  };
}

async function probeWebsiteForAi(website: string): Promise<WaAiSignal & { ok: boolean }> {
  const fromUrl = detectWhatsAppAiSignals("", website);
  if (fromUrl.hit) return { ...fromUrl, ok: true };
  if (typeof window === "undefined") return { hit: false, signals: [], ok: false };
  try {
    const res = await fetch("/api/prospect/site-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: website }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { hit: false, signals: [], ok: false };
    const data = (await res.json()) as { hit?: boolean; signals?: string[] };
    return { hit: Boolean(data.hit), signals: data.signals ?? [], ok: true };
  } catch {
    return { hit: false, signals: [], ok: false };
  }
}

export async function markLikelyNoWhatsAppAi(places: MapPlace[], probeSites: boolean): Promise<MapPlace[]> {
  const out: MapPlace[] = [];
  let probes = 0;
  for (const p of places) {
    const local = detectWhatsAppAiSignals(`${p.name} ${p.address}`, p.website || "");
    if (local.hit) continue;
    if (!p.website) {
      out.push({ ...p, likelyNoWaAi: true, waAiReason: "Sem site no mapa — improvável ter IA no WhatsApp" });
      continue;
    }
    if (!probeSites || probes >= 24) {
      out.push({ ...p, likelyNoWaAi: true, waAiReason: "Site sem fornecedor conhecido de chatbot na URL" });
      continue;
    }
    probes += 1;
    const probed = await probeWebsiteForAi(p.website);
    if (probed.hit) continue;
    out.push({
      ...p,
      likelyNoWaAi: true,
      waAiReason: probed.ok ? "Site sem rastros de chatbot/IA no atendimento" : "Não deu para ler o site; URL sem bot conhecido",
    });
  }
  return out;
}

async function searchCity(segment: string, city: string, limit: number, includeWebsites = false): Promise<MapPlace[]> {
  const geo = await geocode(city);
  if (!geo) return [];
  const inner = overpassClauses(segment)
    .map((clause) => `${clause}(around:25000,${geo.lat},${geo.lon});`)
    .join("\n");
  const ql = `
[out:json][timeout:40];
(
${inner}
);
out center ${Math.max(limit * 12, 80)};
`.trim();

  let data: { elements?: unknown[] } | null = null;
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/maps/overpass", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ql }),
        signal: AbortSignal.timeout(40_000),
      });
      if (res.ok) data = await res.json();
    } catch {
      data = null;
    }
  }
  // Proxy frio/CORS: tenta Overpass direto no browser também.
  if (!data?.elements?.length) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json",
            "User-Agent": UA,
          },
          body: `data=${encodeURIComponent(ql)}`,
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) continue;
        data = await res.json();
        if (Array.isArray(data?.elements) && data.elements.length) break;
      } catch {
        /* próximo mirror */
      }
    }
  }
  if (!data) data = { elements: [] };
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const out: MapPlace[] = [];
  for (const el of elements) {
    const place = placeFromTags((el as { tags?: Record<string, unknown> }).tags ?? {}, city, includeWebsites);
    if (!place) continue;
    out.push(place);
    if (out.length >= limit) break;
  }
  if (out.filter((p) => isValidBrazilWhatsApp(p.phone)).length < limit && geo) {
    const phones = await searchPhonesAround(geo, city, limit, includeWebsites);
    for (const p of phones) {
      if (out.some((x) => digits(x.phone) === digits(p.phone) || x.name === p.name)) continue;
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  if (out.length < limit && geo) {
    const extra = await photonPlaces(segment, city, geo, limit - out.length, includeWebsites);
    for (const p of extra) {
      if (out.some((x) => x.name === p.name)) continue;
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function searchPhonesAround(geo: { lat: number; lon: number }, city: string, limit: number, includeWebsites = false): Promise<MapPlace[]> {
  const ql = `
[out:json][timeout:40];
(
  node["name"]["phone"](around:18000,${geo.lat},${geo.lon});
  node["name"]["contact:phone"](around:18000,${geo.lat},${geo.lon});
  node["name"]["contact:mobile"](around:18000,${geo.lat},${geo.lon});
  node["name"]["contact:whatsapp"](around:18000,${geo.lat},${geo.lon});
);
out 180;
`.trim();
  let data: { elements?: any[] } | null = null;
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/maps/overpass", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ql }),
        signal: AbortSignal.timeout(40_000),
      });
      if (res.ok) data = await res.json();
    } catch {
      data = null;
    }
  }
  if (!data?.elements?.length) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json",
            "User-Agent": UA,
          },
          body: `data=${encodeURIComponent(ql)}`,
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) continue;
        data = await res.json();
        if (Array.isArray(data?.elements) && data.elements.length) break;
      } catch {
        /* próximo */
      }
    }
  }
  const elements = Array.isArray(data?.elements) ? data!.elements! : [];
  const out: MapPlace[] = [];
  for (const el of elements) {
    const place = placeFromTags(el.tags ?? {}, city, includeWebsites);
    if (!place || !isValidBrazilWhatsApp(place.phone)) continue;
    out.push(place);
    if (out.length >= limit) break;
  }
  return out;
}

async function photonPlaces(
  segment: string,
  city: string,
  geo: { lat: number; lon: number },
  limit: number,
  includeWebsites = false,
): Promise<MapPlace[]> {
  const q = `${segment.replace(/sem site/gi, "").trim()} ${city}`;
  const url = typeof window !== "undefined"
    ? `/api/maps/photon?q=${encodeURIComponent(q)}&lat=${geo.lat}&lon=${geo.lon}&limit=${Math.max(limit, 12)}`
    : `${PHOTON}?q=${encodeURIComponent(q)}&lat=${geo.lat}&lon=${geo.lon}&limit=${Math.max(limit, 12)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const data = await res.json();
    const feats = Array.isArray(data?.features) ? data.features : [];
    const cityHint = city.split(",")[0]!.trim().toLowerCase();
    const out: MapPlace[] = [];
    for (const f of feats) {
      const p = f?.properties ?? {};
      const name = String(p.name || "").trim();
      if (!name) continue;
      const featCity = String(p.city || p.state || "").toLowerCase();
      if (cityHint && featCity && !featCity.includes(cityHint) && !cityHint.includes(featCity)) continue;
      if (!includeWebsites && osmHasWebsiteOrMenu(p)) continue;
      const website = osmWebsite(p) || undefined;
      out.push({
        name,
        phone: normalizePhone(String(p.phone || p["osm:phone"] || "")),
        city,
        address: [p.street, p.housenumber, p.city || city].filter(Boolean).join(", "),
        website,
        contactName: name,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function osmHasWebsiteOrMenu(tags: Record<string, unknown> = {}) {
  const site = String(tags.website || tags["contact:website"] || "").trim();
  const menu = String(tags.menu || tags["website:menu"] || tags["contact:menu"] || "").trim();
  if (site || menu) return true;
  return /ifood|rappi|aiqfome|cardapio\.|menudino/i.test(`${site} ${menu}`);
}

export async function searchBusinessesWithoutWebsite(opts: {
  segment: string;
  city?: string;
  state?: string;
  nationwide?: boolean;
  limit?: number;
  /** Inclui quem tem site, se não houver sinal de IA/chatbot no atendimento. */
  noWhatsAppAi?: boolean;
}): Promise<MapPlace[]> {
  const limit = Math.min(opts.limit ?? 10, 150);
  let cities = await resolveSearchCities({
    city: opts.city,
    state: opts.state,
    nationwide: opts.nationwide,
    niche: opts.segment,
  });
  if (limit >= 20 && /s[aã]o paulo/i.test(`${opts.city ?? ""} ${opts.state ?? ""}`)) {
    const extra = citiesForState("SP").slice(0, 5);
    cities = [...new Set([...cities, ...extra.map((c) => (c.includes(",") ? c : `${c}, SP`))])];
  }
  const perCity = Math.max(2, Math.ceil(limit / Math.max(cities.length, 1)));
  const seen = new Set<string>();
  const out: MapPlace[] = [];
  for (const city of cities) {
    if (out.length >= limit) break;
    try {
      const found = await searchCity(opts.segment, city, perCity + 4, Boolean(opts.noWhatsAppAi));
      const marked = opts.noWhatsAppAi ? await markLikelyNoWhatsAppAi(found, true) : found.map((p) => ({
        ...p,
        likelyNoWaAi: !p.website,
        waAiReason: p.website ? undefined : "Sem site no mapa — improvável ter IA no WhatsApp",
      }));
      for (const p of marked) {
        const key = digits(p.phone) || p.name;
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
    isCellPhone: isValidBrazilWhatsApp(p.phone),
    whatsappVerified: isValidBrazilWhatsApp(p.phone),
    website: p.website,
    hasWebsite: Boolean(p.website),
    likelyNoWaAi: p.likelyNoWaAi ?? !p.website,
    waAiReason: p.waAiReason,
    rating: 0,
    reviewCount: 0,
    tag: i === 0 ? "TUBARÃO" : "PREMIUM",
    type: "quente",
    ownerContact: p.contactName,
    whatsappScore: 92,
    selected: false,
  }));
}
