import { evolutionSendText, getAgencyConnection } from "@/lib/evolution/evolutionapi";
import { dispatchProspectMessages, buildProspectMessage } from "@/lib/evolution/prospectDispatcher";
import { buildCatalogOpening } from "@/lib/catalog";
import { stageForNewProspect } from "@/lib/crm/pipelineStages";
import { formatForWhatsApp } from "@/lib/helena/whatsapp-formatter";
import { bumpAutomation, getDB, nowISO, uid, update } from "@/lib/store";
import { syncLiveCommercial } from "@/lib/analytics";
import { digits, isValidBrazilWhatsApp, searchBusinessesWithoutWebsite, WAVE_CITIES, WAVE_NICHES, type MapPlace } from "./mapsSearch";

export function activateCommercialTeam() {
  update((d) => {
    const team = d.teams.find((t) => t.id === "t_com");
    if (team) team.status = "ativo";
    d.agents.forEach((a) => {
      if (a.teamId !== "t_com") return;
      a.status = "trabalhando";
      if (a.id === "a_sdr1") a.currentTask = "Marina · clínicas e saúde no WhatsApp";
      else if (a.id === "a_sdr2") a.currentTask = "Camila · comércio local no WhatsApp";
      else if (a.id === "a_qual") a.currentTask = "Rafael · só quem respondeu";
      else if (a.role === "Closer") a.currentTask = "Fechar reunião de 10 min";
      else a.currentTask = "Comercial · Maps sem site";
    });
  });
}

function ownerForSegment<T extends { id: string; teamId?: string; role: string }>(segment: string, slot: number, agents: T[]): T {
  const roster = agents.filter((a) => a.teamId === "t_com" && a.role === "SDR");
  const n = segment.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const saude = /odont|dentist|clinic|estetic|veterin|pet shop|medico|saude/;
  const prefer = saude.test(n) ? "a_sdr1" : "a_sdr2";
  return roster.find((a) => a.id === prefer) ?? roster[slot % Math.max(1, roster.length)] ?? roster[0] ?? agents[0];
}

/** Chave estável do WhatsApp BR (evita recriar lead e reabordar). */
export function phoneDedupeKey(phone: string) {
  let d = digits(phone);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.slice(-11);
}

export function insertPlacesAsLeads(places: MapPlace[], segment: string) {
  const conn = getAgencyConnection(getDB());
  const createdContactIds: string[] = [];

  update((d) => {
    const pipeline = d.pipelines[0];
    const existingPhones = new Set(d.contacts.map((c) => phoneDedupeKey(c.phone)).filter(Boolean));
    let slot = d.contacts.length;
    places.forEach((place) => {
      if (place.website && !place.likelyNoWaAi) return;
      if (!isValidBrazilWhatsApp(place.phone)) return;
      const phoneKey = phoneDedupeKey(place.phone);
      if (!phoneKey || phoneKey.endsWith("18981011186") || phoneKey === "18981011186") return;
      if (existingPhones.has(phoneKey)) return;
      existingPhones.add(phoneKey);

      const owner = ownerForSegment(segment, slot, d.agents);
      if (!owner) return;
      slot += 1;
      const compId = uid("c_maps_");
      const contactId = uid("p_maps_");
      const dealId = uid("d_maps_");
      createdContactIds.push(contactId);
      const dealTags = [
        ...(place.website ? [] : ["#sem-site"]),
        ...(place.likelyNoWaAi ? ["#sem-ia-whatsapp"] : []),
      ];
      // Sem site = já qualificado (Helena joga direto em Qualificado).
      const stage = stageForNewProspect(pipeline, dealTags) || pipeline?.stages[0];
      d.companies.unshift({
        id: compId,
        organizationId: d.organization.id,
        name: place.name,
        segment,
        city: place.city,
        size: "1–10",
        website: place.website || "",
        ownerId: owner.id,
        createdAt: nowISO(),
      });
      d.contacts.unshift({
        id: contactId,
        organizationId: d.organization.id,
        name: place.contactName,
        email: "",
        phone: place.phone,
        companyId: compId,
        title: segment,
        tags: [
          ...dealTags,
          "OpenStreetMap",
          segment.toLowerCase(),
        ],
        source: "Prospecção",
        ownerId: owner.id,
        status: "lead",
        score: 80,
        consent: true,
        createdAt: nowISO(),
        lastContactAt: nowISO(),
      });
      if (stage && pipeline) {
        d.deals.unshift({
          id: dealId,
          organizationId: d.organization.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: `Site · ${place.name}`,
          contactId,
          companyId: compId,
          value: d.serviceOffers?.find((o) => o.id === "svc_site")?.price ?? 100,
          probability: stage.probability,
          expectedClose: new Date(Date.now() + 20 * 86_400_000).toISOString(),
          ownerId: owner.id,
          ownerType: "agent",
          source: "Prospecção",
          tags: dealTags,
          status: "aberto",
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      }
      const team = d.teams.find((t) => t.id === "t_com");
      if (team) team.metrics.leads += 1;
      if (owner) owner.metrics.conversations += 1;
      const listName = `Maps · ${segment}`;
      let list = d.lists.find((l) => l.name === listName);
      if (!list) {
        list = {
          id: uid("l_maps_"),
          organizationId: d.organization.id,
          name: listName,
          segment,
          icp: "WhatsApp celular BR · sem site e/ou sem rastros de IA no atendimento",
          count: 0,
          source: "OpenStreetMap",
          blacklisted: 0,
          createdAt: nowISO(),
        };
        d.lists.unshift(list);
      }
      list.count += 1;
      bumpAutomation(d, "lead_criado");
      // Conversa vazia até o disparo Evolution — evita mensagem duplicada no Inbox.
      d.conversations.unshift({
        id: uid("conv_"),
        organizationId: d.organization.id,
        contactId,
        channel: "whatsapp",
        connectionId: conn?.id,
        status: "aberta",
        handlerType: "agent",
        handlerId: owner.id,
        unread: 0,
        sentiment: "neutro",
        lastMessageAt: nowISO(),
        remoteJid: `${(() => { const n = digits(place.phone); return n.startsWith("55") ? n : `55${n}`; })()}@s.whatsapp.net`,
        flow: { origin: "prospeccao", state: "novo", lastOutboundAt: "", closerAttempts: 0 },
        messages: [],
      });
    });
    syncLiveCommercial(d);
  });
  // Pipeline no Supabase na hora — senão some no refresh.
  if (createdContactIds.length) {
    void import("@/lib/persist/cycle").then(({ flushCyclePush }) => flushCyclePush()).catch(() => {});
  }
  return createdContactIds;
}

function canDispatchWhatsApp() {
  // Browser: /api/evo injeta a chave. Servidor: precisa EVOLUTION_KEY.
  if (typeof window !== "undefined") return true;
  return Boolean(typeof process !== "undefined" && process.env?.EVOLUTION_KEY);
}

function contactsForDispatch(ids: string[]) {
  const db = getDB();
  return ids.map((id) => {
    const c = db.contacts.find((x) => x.id === id)!;
    const comp = db.companies.find((x) => x.id === c.companyId);
    const agent = db.agents.find((a) => a.id === c.ownerId);
    return {
      phone: c.phone,
      name: c.name,
      companyName: comp?.name ?? c.name,
      contactId: c.id,
      agentName: agent?.name ?? "SDR 01",
    };
  });
}

/** Niche genérico no OSM quase não traz celular — usa onda multi-nicho SP. */
function isWeakSegment(segment: string) {
  const n = segment.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return !n.trim() || /negocios locais|sem site|empresas|clientes|leads|comercios? locais$/.test(n);
}

export async function runRealProspecting(opts: {
  segment: string;
  city: string;
  state?: string;
  nationwide?: boolean;
  limit: number;
  organizationId: string;
  operationId?: string;
  noWhatsAppAi?: boolean;
}) {
  activateCommercialTeam();
  // Só onda multi-nicho quando o pedido é genérico — nunca troca "restaurantes em X" por advogado em SP.
  if (isWeakSegment(opts.segment) && !opts.city?.trim()) {
    return runWaveProspecting({
      limit: opts.limit,
      organizationId: opts.organizationId,
      operationId: opts.operationId,
    });
  }

  // Genérico → onda multi-nicho (não “vira restaurante” e gera cardápio pra chaveiro).
  if (isWeakSegment(opts.segment)) {
    return runWaveProspecting({
      limit: opts.limit,
      organizationId: opts.organizationId,
      operationId: opts.operationId,
    });
  }

  const places = await searchBusinessesWithoutWebsite({
    segment: opts.segment,
    city: opts.city,
    state: opts.state,
    nationwide: opts.nationwide,
    limit: opts.limit,
    noWhatsAppAi: opts.noWhatsAppAi,
  });
  if (!places.length) return { found: 0, sent: 0, failed: 0, skipped: 0 };
  const ids = insertPlacesAsLeads(places, opts.segment);
  if (!ids.length) return { found: places.length, sent: 0, failed: 0, skipped: places.length };
  const contacts = contactsForDispatch(ids);
  if (!canDispatchWhatsApp()) return { found: places.length, sent: 0, failed: 0, skipped: contacts.length };
  const disp = await dispatchProspectMessages(contacts, buildProspectMessage, opts.organizationId, opts.operationId);
  return { found: places.length, sent: disp.sent, failed: disp.failed, skipped: disp.skipped };
}

export async function sendOpeningNow(phone: string, contactName: string, companyName: string) {
  const text = formatForWhatsApp(buildCatalogOpening(contactName, companyName, getDB().serviceOffers ?? []));
  return evolutionSendText(phone, text);
}

export async function runWaveProspecting(opts: {
  limit?: number;
  organizationId: string;
  operationId?: string;
  niches?: string[];
  nationwide?: boolean;
  /** Quando o gestor pediu cidade específica (ex.: Balneário Camboriú), a onda fica só nela. */
  cities?: string[];
  city?: string;
}) {
  activateCommercialTeam();
  const target = Math.min(Math.max(opts.limit ?? 150, 1), 1000);
  // Diversos nichos + várias cidades ao mesmo tempo (até 1000 leads). Brasil = hubs nacionais.
  // Cidade nomeada no prompt: não espalha pra SP/Brasil.
  const { NATIONAL_HUBS } = await import("./mapsSearch");
  const pinned = (opts.cities?.length ? opts.cities : opts.city ? [opts.city] : [])
    .map((c) => String(c).trim())
    .filter((c) => c && !/^brasil$/i.test(c));
  const cityPool = pinned.length
    ? pinned
    : opts.nationwide
      ? [...new Set([...NATIONAL_HUBS, ...WAVE_CITIES])]
      : WAVE_CITIES;
  const hubs = pinned.length
    ? pinned
    : cityPool.slice(0, target <= 60 ? 3 : target <= 200 ? 6 : cityPool.length);
  const pool = (opts.niches?.length ? opts.niches : WAVE_NICHES).filter(Boolean);
  const niches = pool.slice(0, target <= 60 ? Math.min(8, pool.length) : target <= 200 ? Math.min(12, pool.length) : pool.length);
  const perCombo = Math.min(Math.max(Math.ceil(target / Math.max(1, hubs.length * niches.length)) + 2, 3), 14);
  const seen = new Set<string>(getDB().contacts.map((c) => phoneDedupeKey(c.phone)).filter(Boolean));
  const bag: { place: MapPlace; segment: string }[] = [];
  for (const city of hubs) {
    for (const niche of niches) {
      if (bag.length >= target) break;
      try {
        const stateGuess = String(city).match(/,\s*([A-Z]{2})\s*$/)?.[1] || (opts.nationwide ? undefined : "SP");
        const found = await searchBusinessesWithoutWebsite({
          segment: niche,
          city,
          state: stateGuess,
          nationwide: false,
          limit: perCombo,
        });
        for (const p of found) {
          if (!isValidBrazilWhatsApp(p.phone)) continue;
          const k = phoneDedupeKey(p.phone);
          if (!k || seen.has(k) || k === "18981011186") continue;
          seen.add(k);
          bag.push({ place: p, segment: niche });
          if (bag.length >= target) break;
        }
      } catch {
        /* próxima combinação */
      }
    }
  }
  const bySeg = new Map<string, MapPlace[]>();
  for (const item of bag) {
    const list = bySeg.get(item.segment) ?? [];
    list.push(item.place);
    bySeg.set(item.segment, list);
  }
  const ids: string[] = [];
  for (const [segment, places] of bySeg) {
    ids.push(...insertPlacesAsLeads(places, segment));
  }
  if (!ids.length) return { found: 0, sent: 0, failed: 0, skipped: 0 };
  const contacts = contactsForDispatch(ids);
  if (!canDispatchWhatsApp()) return { found: bag.length, sent: 0, failed: 0, skipped: contacts.length };
  const disp = await dispatchProspectMessages(contacts, buildProspectMessage, opts.organizationId, opts.operationId);
  return { found: bag.length, sent: disp.sent, failed: disp.failed, skipped: disp.skipped };
}

export async function dispatchLeadsToAgents(places: MapPlace[], segment: string) {
  activateCommercialTeam();
  const ids = insertPlacesAsLeads(places, segment);
  if (!ids.length) return { found: places.length, sent: 0, failed: 0, skipped: places.length };
  const contacts = contactsForDispatch(ids);
  if (!canDispatchWhatsApp()) return { found: places.length, sent: 0, failed: 0, skipped: contacts.length };
  const disp = await dispatchProspectMessages(contacts, buildProspectMessage, getDB().organization.id);
  return { found: places.length, sent: disp.sent, failed: disp.failed, skipped: disp.skipped };
}
