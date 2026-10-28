import { evolutionSendText, getAgencyConnection, getEvolutionConfigUI } from "@/lib/evolution/evolutionapi";
import { dispatchProspectMessages, buildProspectMessage } from "@/lib/evolution/prospectDispatcher";
import { buildCatalogOpening } from "@/lib/catalog";
import { formatForWhatsApp } from "@/lib/helena/whatsapp-formatter";
import { bumpAutomation, getDB, nowISO, uid, update } from "@/lib/store";
import { digits, isValidBrazilWhatsApp, searchBusinessesWithoutWebsite, type MapPlace } from "./mapsSearch";

function commercialRoster() {
  const db = getDB();
  const order = ["SDR 01", "SDR 02", "Qualificador", "Closer"];
  const team = db.agents.filter(
    (a) => a.teamId === "t_com" && ["SDR", "Qualificador", "Closer"].includes(a.role),
  );
  const ranked = order
    .map((name) => team.find((a) => a.name === name))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  return ranked.length ? ranked : team.length ? team : db.agents.slice(0, 1);
}

export function insertPlacesAsLeads(places: MapPlace[], segment: string) {
  const roster = commercialRoster();
  const conn = getAgencyConnection(getDB());
  const createdContactIds: string[] = [];

  update((d) => {
    const pipeline = d.pipelines[0];
    const stage = pipeline?.stages[0];
    const existingPhones = new Set(d.contacts.map((c) => digits(c.phone)));
    let slot = d.contacts.length;
    places.forEach((place) => {
      if (place.website) return;
      if (!isValidBrazilWhatsApp(place.phone)) return;
      const phoneKey = digits(place.phone);
      if (existingPhones.has(phoneKey)) return;
      existingPhones.add(phoneKey);

      const owner = roster[slot % Math.max(1, roster.length)] ?? roster[0] ?? d.agents[0];
      if (!owner) return;
      slot += 1;
      const compId = uid("c_maps_");
      const contactId = uid("p_maps_");
      const dealId = uid("d_maps_");
      createdContactIds.push(contactId);
      d.companies.unshift({
        id: compId,
        organizationId: d.organization.id,
        name: place.name,
        segment,
        city: place.city,
        size: "1–10",
        website: "",
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
        tags: ["#sem-site", "OpenStreetMap", segment.toLowerCase()],
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
          value: 4900,
          probability: stage.probability,
          expectedClose: new Date(Date.now() + 20 * 86_400_000).toISOString(),
          ownerId: owner.id,
          ownerType: "agent",
          source: "Prospecção",
          tags: ["#sem-site"],
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
          icp: "Sem site + WhatsApp celular BR (OpenStreetMap)",
          count: 0,
          source: "OpenStreetMap",
          blacklisted: 0,
          createdAt: nowISO(),
        };
        d.lists.unshift(list);
      }
      list.count += 1;
      bumpAutomation(d, "lead_criado");
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
        messages: [{
          id: uid("m_"),
          from: "agent",
          authorName: owner.name,
          text: formatForWhatsApp(buildCatalogOpening(place.contactName, place.name, d.serviceOffers ?? [])),
          at: nowISO(),
          kind: "text",
        }],
      });
    });
  });
  return createdContactIds;
}

export async function runRealProspecting(opts: {
  segment: string;
  city: string;
  state?: string;
  nationwide?: boolean;
  limit: number;
  organizationId: string;
  operationId?: string;
}) {
  const places = await searchBusinessesWithoutWebsite({
    segment: opts.segment,
    city: opts.city,
    state: opts.state,
    nationwide: opts.nationwide,
    limit: opts.limit,
  });
  if (!places.length) return { found: 0, sent: 0, failed: 0 };
  const ids = insertPlacesAsLeads(places, opts.segment);
  const db = getDB();
  const contacts = ids.map((id) => {
    const c = db.contacts.find((x) => x.id === id)!;
    const comp = db.companies.find((x) => x.id === c.companyId);
    const agent = db.agents.find((a) => a.id === c.ownerId);
    return {
      phone: c.phone,
      name: c.name,
      companyName: comp?.name ?? c.name,
      contactId: c.id,
      agentName: agent?.name ?? "Robson Alex",
    };
  });
  const cfg = getEvolutionConfigUI();
  if (!cfg.apiKey) return { found: places.length, sent: 0, failed: 0 };
  const disp = await dispatchProspectMessages(contacts, buildProspectMessage, opts.organizationId, opts.operationId);
  return { found: places.length, sent: disp.sent, failed: disp.failed };
}

export async function sendOpeningNow(phone: string, contactName: string, companyName: string) {
  const text = formatForWhatsApp(buildCatalogOpening(contactName, companyName, getDB().serviceOffers ?? []));
  return evolutionSendText(phone, text);
}
