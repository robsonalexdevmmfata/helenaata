import type { Agent, DB, SitePreview, Team } from "@/lib/types";
import { bumpAutomation, getDB, nowISO, uid, update } from "@/lib/store";
import { getAgencyConnection } from "@/lib/evolution/evolutionapi";
import { formatForWhatsApp } from "@/lib/helena/whatsapp-formatter";
import { diagnoseLead, setCycleTag } from "@/lib/helena/diagnose";
import { searchBusinessesWithoutWebsite, type MapPlace } from "@/lib/prospect/mapsSearch";
import { normalize } from "@/lib/format";
import { toast } from "sonner";

export const DEV_TEAM_ID = "t_dev";
export const DEV_FE_ID = "a_dev_fe";
export const DEV_BE_ID = "a_dev_be";
export const DEV_DS_ID = "a_dev_ds";
export const DEV_AGENT_IDS = [DEV_FE_ID, DEV_BE_ID, DEV_DS_ID] as const;

export function isFoodNiche(segment: string) {
  const n = normalize(segment);
  return /restaurante|pizzaria|lanchonete|padaria|cafeteria|bar\b|hamburguer|churrasc|comida|gastronom|cardapio|sorvete|acai/.test(n);
}

export function isPresenceIntent(text: string) {
  const n = normalize(text);
  if (/time de desenvolv|desenvolvedores de ia|cardapio|menu online|gerar (o )?(site|landing|cardapio|previa)|montar (o )?(site|cardapio)|criar (o )?(site|cardapio)|previa (do |de )?(site|cardapio)/.test(n)) {
    return true;
  }
  if (/(procure|procurar|encontre|encontrar|busque|buscar|varra|varrer|prospect|cacar|cacar)/.test(n) && /(sem.?site|nao tenha site|nao tem site|sem (presenca|presenca) digital)/.test(n)) {
    return true;
  }
  if (/google maps|maps/.test(n) && /sem.?site/.test(n)) return true;
  return false;
}

export const PUBLIC_SITE_ORIGIN = String(
  import.meta.env.VITE_PUBLIC_SITE_URL ?? "https://helenaata.vercel.app",
).replace(/\/$/, "");

export function previewOrigin() {
  return PUBLIC_SITE_ORIGIN;
}

export function previewUrl(slug: string) {
  return `${previewOrigin()}/v/${slug}`;
}

export function slugify(name: string) {
  const base = normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "negocio";
}

export function paletteFor(segment: string) {
  const n = normalize(segment);
  if (isFoodNiche(n)) return { bg: "#1c1410", fg: "#f7efe6", accent: "#e07a3d" };
  if (/barbearia|salao|cabeleireir/.test(n)) return { bg: "#121212", fg: "#f4e9d0", accent: "#c9a227" };
  if (/advog|jurid/.test(n)) return { bg: "#0f172a", fg: "#e8eef7", accent: "#3b82f6" };
  if (/clinic|dentist|odont|estetic|medico|saude/.test(n)) return { bg: "#0b1f1c", fg: "#e8f6f2", accent: "#2dd4bf" };
  if (/imobili|oficina/.test(n)) return { bg: "#1a1714", fg: "#f3eee6", accent: "#d97706" };
  return { bg: "#111827", fg: "#f3f4f6", accent: "#34d399" };
}

export function buildPreviewOpening(contactName: string, companyName: string, url: string, withMenu: boolean, pitch?: string) {
  const who = contactName ? `Olá ${contactName}!` : "Olá!";
  if (pitch) {
    return `${who} ${pitch} Prévia: ${url}

Você é o proprietário ou a proprietária?`;
  }
  const offer = withMenu ? "site nem cardápio online" : "site";
  return `${who} Sou o Robson Alex, da Info Tech. Vi a ${companyName} no mapa e não encontrei ${offer} online. Montei uma prévia com as informações públicas disponíveis para vocês verem como ficaria: ${url}

Você é o proprietário ou a proprietária?`;
}

export function buildSitePreview(opts: {
  organizationId: string;
  companyId: string;
  contactId: string;
  dealId?: string;
  place: MapPlace;
  segment: string;
  slug: string;
}): SitePreview {
  const rating = opts.place.rating ?? 0;
  const reviewCount = opts.place.reviewCount ?? 0;
  const query = encodeURIComponent(`${opts.place.name} ${opts.place.address || opts.place.city}`);
  return {
    id: uid("prev_"),
    organizationId: opts.organizationId,
    slug: opts.slug,
    companyId: opts.companyId,
    contactId: opts.contactId,
    dealId: opts.dealId,
    name: opts.place.name,
    segment: opts.segment,
    city: opts.place.city,
    address: opts.place.address || opts.place.city,
    phone: opts.place.phone,
    rating: Math.round(rating * 10) / 10,
    reviewCount,
    reviews: [],
    hours: opts.place.hours || "",
    tagline: `${opts.place.name} · Informações e contato em ${opts.place.city}.`,
    about: `Esta prévia reúne as informações públicas disponíveis sobre ${opts.place.name}. Confirme diretamente com o estabelecimento os horários, serviços e itens de cardápio antes de publicar.`,
    palette: paletteFor(opts.segment),
    photos: [],
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${query}`,
    previewPath: `/v/${opts.slug}`,
    status: "enviada",
    createdBy: "Time Desenvolvimento IA",
    createdAt: nowISO(),
  };
}

export function ensureDevSquad(db: DB) {
  if (!Array.isArray(db.sitePreviews)) db.sitePreviews = [];
  const mk = (a: Partial<Agent> & Pick<Agent, "id" | "name" | "role">): Agent => ({
    organizationId: db.organization.id,
    description: "",
    objective: "",
    personality: "Técnico, preciso e colaborativo.",
    prompt: "",
    model: "anthropic/claude-sonnet",
    temperature: 0.35,
    knowledgeIds: [],
    tools: ["knowledge.search", "crm.search_contacts"],
    channels: ["webchat"],
    schedule: "Seg–Sex, 08:00–19:00",
    budget: 220,
    spent: 0,
    status: "aguardando",
    permissions: ["crm.view", "helena.use"],
    color: "chart-1",
    metrics: { tasks: 0, conversations: 0, responseRate: 0, conversions: 0 },
    teamId: DEV_TEAM_ID,
    ...a,
  });
  if (!db.agents.some((a) => a.id === DEV_FE_ID)) {
    db.agents.push(mk({
      id: DEV_FE_ID, name: "Caio Ferreira", role: "Front-end Sênior", color: "chart-1",
      description: "Engenheiro de software sênior · front-end",
      objective: "Montar uma prévia usando somente dados públicos verificáveis, sem inventar avaliações, fotos ou cardápios.",
      personality: "Detalhista em UI, fala de entrega, não de buzzword.",
      supervisorId: DEV_FE_ID,
    }));
  }
  if (!db.agents.some((a) => a.id === DEV_BE_ID)) {
    db.agents.push(mk({
      id: DEV_BE_ID, name: "Diego Nakamura", role: "Back-end Sênior", color: "chart-2",
      description: "Engenheiro de software sênior · back-end",
      objective: "Estruturar cardápio/catálogo, link de prévia e dados de contato para o Time Comercial enviar.",
      personality: "Direto, pensa em dado limpo e link estável.",
      supervisorId: DEV_FE_ID,
      model: "openai/gpt-4o",
    }));
  }
  if (!db.agents.some((a) => a.id === DEV_DS_ID)) {
    db.agents.push(mk({
      id: DEV_DS_ID, name: "Sofia Almeida", role: "Designer Sênior", color: "chart-4",
      description: "Designer gráfico sênior",
      objective: "Definir a identidade visual da prévia sem atribuir imagens genéricas ao estabelecimento.",
      personality: "Visual forte, copy curta, marca local.",
      supervisorId: DEV_FE_ID,
      model: "google/gemini-flash",
    }));
  }
  const team: Team = {
    id: DEV_TEAM_ID,
    organizationId: db.organization.id,
    name: "Desenvolvimento IA",
    objective: "Quando a Helena achar negócio sem site (e sem cardápio online, se for comida), montar prévia com dados do mapa e passar o link ao Time Comercial.",
    supervisorId: DEV_FE_ID,
    agentIds: [...DEV_AGENT_IDS],
    goals: "Prévia pronta + link enviado ao comercial",
    schedule: "Seg–Sex, 08:00–19:00",
    channels: ["webchat", "whatsapp"],
    budget: 700,
    spent: 0,
    status: "ativo",
    metrics: { leads: 0, meetings: 0, conversions: 0 },
  };
  const existing = db.teams.find((t) => t.id === DEV_TEAM_ID);
  if (!existing) db.teams.push(team);
  else {
    existing.objective = team.objective;
    existing.agentIds = [...DEV_AGENT_IDS];
    existing.supervisorId = DEV_FE_ID;
  }
}

export function applyPresenceFromPlaces(opts: {
  places: MapPlace[];
  segment: string;
  city: string;
}): { count: number; previewIds: string[]; slugs: string[] } {
  const food = isFoodNiche(opts.segment);
  const previewIds: string[] = [];
  const slugs: string[] = [];
  const published: SitePreview[] = [];
  const createdContactIds: string[] = [];
  const dispatchMeta: { contactId: string; withMenu: boolean; slug: string }[] = [];

  update((d) => {
    ensureDevSquad(d);
    const pipeline = d.pipelines[0];
    const stage = pipeline?.stages[0];
    const sdrs = d.agents.filter((a) => a.role === "SDR");
    const used = new Set(d.sitePreviews.map((p) => p.slug));
    d.agents.forEach((a) => {
      if (a.id === DEV_FE_ID) { a.status = "trabalhando"; a.currentTask = "Montar páginas da prévia"; a.metrics.tasks += opts.places.length; }
      if (a.id === DEV_BE_ID) { a.status = "trabalhando"; a.currentTask = food ? "Estruturar cardápio e link" : "Estruturar catálogo e link"; a.metrics.tasks += opts.places.length; }
      if (a.id === DEV_DS_ID) { a.status = "trabalhando"; a.currentTask = "Identidade visual do nicho"; a.metrics.tasks += opts.places.length; }
      if (a.teamId === "t_com" && a.role === "SDR") { a.status = "trabalhando"; a.currentTask = "Abordar dono com link da prévia"; }
    });
    const devTeam = d.teams.find((t) => t.id === DEV_TEAM_ID);
    if (devTeam) {
      devTeam.status = "ativo";
      devTeam.metrics.leads += opts.places.length;
    }
    const com = d.teams.find((t) => t.id === "t_com");
    if (com) {
      com.status = "ativo";
      com.metrics.leads += opts.places.length;
    }

    opts.places.forEach((place, i) => {
      const owner = sdrs[i % Math.max(1, sdrs.length)] ?? d.agents.find((a) => a.role === "SDR");
      if (!owner) return;
      const compId = uid("c_maps_");
      const contactId = uid("p_maps_");
      const dealId = uid("d_maps_");
      let slug = slugify(place.name);
      if (used.has(slug)) slug = `${slug}-${uid("").slice(0, 4)}`;
      used.add(slug);

      d.companies.unshift({
        id: compId,
        organizationId: d.organization.id,
        name: place.name,
        segment: opts.segment,
        city: place.city || opts.city,
        size: "1–10",
        website: "",
        ownerId: owner.id,
        createdAt: nowISO(),
      });
      const tags = ["#sem-site", "Google Maps", opts.segment.toLowerCase(), "#previa-pronta"];
      if (food) tags.push("#sem-cardapio");
      const dx = diagnoseLead({
        name: place.name,
        segment: opts.segment,
        city: place.city || opts.city,
        website: "",
        tags,
        rating: place.rating,
        photos: 0,
        hasMenu: false,
        hasWhatsApp: Boolean(place.phone),
      });
      d.contacts.unshift({
        id: contactId,
        organizationId: d.organization.id,
        name: place.contactName || place.name,
        email: "",
        phone: place.phone,
        companyId: compId,
        title: "Proprietário",
        tags: setCycleTag([...tags, ...dx.findings.map((f) => `#dx-${f.code}`)], "preview"),
        source: "Prospecção",
        ownerId: owner.id,
        status: "lead",
        score: dx.score,
        consent: true,
        createdAt: nowISO(),
        lastContactAt: nowISO(),
      });
      createdContactIds.push(contactId);
      if (stage && pipeline) {
        d.deals.unshift({
          id: dealId,
          organizationId: d.organization.id,
          pipelineId: pipeline.id,
          stageId: stage.id,
          title: `${food ? "Site + cardápio" : "Site"} · ${place.name}`,
          contactId,
          companyId: compId,
          value: d.serviceOffers?.find((o) => o.id === "svc_site")?.price ?? 547,
          probability: stage.probability,
          expectedClose: new Date(Date.now() + 20 * 86_400_000).toISOString(),
          ownerId: owner.id,
          ownerType: "agent",
          source: "Prospecção",
          status: "aberto",
          tags: food ? ["#sem-site", "#sem-cardapio", "prévia"] : ["#sem-site", "prévia"],
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      }
      const preview = buildSitePreview({
        organizationId: d.organization.id,
        companyId: compId,
        contactId,
        dealId,
        place,
        segment: opts.segment,
        slug,
      });
      d.sitePreviews.unshift(preview);
      previewIds.push(preview.id);
      slugs.push(slug);
      published.push(preview);
      dispatchMeta.push({ contactId, withMenu: food, slug });
      const url = previewUrl(slug);
      d.conversations.unshift({
        id: uid("conv_"),
        organizationId: d.organization.id,
        contactId,
        channel: "whatsapp",
        connectionId: getAgencyConnection(d)?.id ?? d.salesFlow?.sharedConnectionId,
        flow: { origin: "prospeccao", state: "abordado", lastOutboundAt: nowISO(), closerAttempts: 0 },
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
          text: formatForWhatsApp(buildPreviewOpening(place.contactName || place.name, place.name, url, food, dx.recommend_pitch)),
          at: nowISO(),
          kind: "text",
        }],
      });
      d.activities.unshift({
        id: uid("ac_"),
        organizationId: d.organization.id,
        contactId,
        dealId,
        type: "ia",
        text: `Time Desenvolvimento IA gerou a prévia ${url}. Time Comercial (Marina/Camila) abordou o proprietário com o link.`,
        actor: "Helena",
        createdAt: nowISO(),
      });
    });

    const code = `OP-${String(d.operations.length + 2940).padStart(4, "0")}`;
    d.operations.unshift({
      id: uid("op_dev_"),
      organizationId: d.organization.id,
      code,
      title: `Prévia digital · ${opts.segment}`,
      objective: `Encontrar ${opts.places.length} ${opts.segment} sem site${food ? " e sem cardápio online" : ""}, gerar prévia e enviar o link ao comercial.`,
      requestedBy: "Helena",
      agentIds: [...DEV_AGENT_IDS, ...d.agents.filter((a) => a.role === "SDR").map((a) => a.id)],
      connectionId: getAgencyConnection(d)?.id,
      status: "completed",
      total: opts.places.length,
      processed: opts.places.length,
      metrics: { responded: 0, interested: 0, qualified: 0, meetings: 0, handoffs: opts.places.length },
      cost: Math.round(opts.places.length * 0.12 * 100) / 100,
      steps: [
        { id: "s0", label: "Varredura Maps (sem site / sem cardápio)", status: "done" },
        { id: "s1", label: "Sofia · identidade visual", status: "done" },
        { id: "s2", label: food ? "Diego · cardápio e dados" : "Diego · catálogo e dados", status: "done" },
        { id: "s3", label: "Caio · páginas da prévia", status: "done" },
        { id: "s4", label: "Link de visualização", status: "done" },
        { id: "s5", label: "Handoff ao Time Comercial", status: "done" },
      ],
      events: [
        { at: nowISO(), text: `Helena acionou o Time Desenvolvimento IA para ${opts.segment} em ${opts.city}`, kind: "info" },
        { at: nowISO(), text: `${opts.places.length} prévias geradas e enviadas ao comercial`, kind: "success" },
      ],
      createdAt: nowISO(),
      result: `${opts.places.length} links de prévia prontos`,
    });
    bumpAutomation(d, "lead_criado", opts.places.length);
  });

  if (typeof process !== "undefined" && process.env?.VITEST) {
    return { count: previewIds.length, previewIds, slugs };
  }

  import("@/lib/dev/previewPublish").then(async ({ publishSitePreviews }) => {
    const deployed = await publishSitePreviews(published);
    const db2 = getDB();
    const contacts = createdContactIds.map((cid) => {
      const c = db2.contacts.find((x) => x.id === cid);
      const comp = db2.companies.find((x) => x.id === c?.companyId);
      const meta = dispatchMeta.find((m) => m.contactId === cid);
      return c && meta ? {
        phone: c.phone,
        name: c.name,
        companyName: comp?.name ?? "empresa",
        contactId: c.id,
        agentName: "Robson Alex",
        withMenu: meta.withMenu,
        slug: meta.slug,
      } : null;
    }).filter(Boolean) as Array<{ phone: string; name: string; companyName: string; contactId: string; agentName: string; withMenu: boolean; slug: string }>;
    if (!contacts.length) return;
    const { dispatchProspectMessages } = await import("@/lib/evolution/prospectDispatcher");
    await dispatchProspectMessages(
      contacts,
      (ct) => {
        const row = contacts.find((x) => x.contactId === ct.contactId);
        const live = row ? deployed[row.slug]?.vercelUrl : undefined;
        const url = live || previewUrl(row?.slug ?? "preview");
        const lead = db2.contacts.find((x) => x.id === ct.contactId);
        const pitch = (lead?.tags || []).includes("#dx-cardapio") || (lead?.tags || []).includes("#dx-sem_site")
          ? diagnoseLead({
            name: ct.companyName,
            segment: db2.companies.find((c) => c.id === lead?.companyId)?.segment,
            city: db2.companies.find((c) => c.id === lead?.companyId)?.city,
            tags: lead?.tags,
            hasWhatsApp: true,
          }).recommend_pitch
          : undefined;
        return formatForWhatsApp(buildPreviewOpening(ct.name, ct.companyName, url, Boolean(row?.withMenu), pitch));
      },
      db2.organization.id,
    );
  }).catch((err) => {
    console.error("[Time Dev deploy]", err);
    toast.error("Não foi possível publicar as prévias. Nenhuma mensagem será enviada.");
  });

  return { count: previewIds.length, previewIds, slugs };
}

export function runPresencePipeline(p: {
  segment?: string;
  city?: string;
  limit?: number;
  nationwide?: boolean;
}): { ok: boolean; message: string; data: Record<string, unknown> } {
  const segment = String(p.segment || "negócios locais");
  const city = String(p.city || "Brasil");
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 50);
  if (typeof process !== "undefined" && process.env?.VITEST) {
    return {
      ok: false,
      message: "A busca real do Maps para gerar prévias não é executada em testes; nenhum lead fictício foi criado.",
      data: { count: 0 },
    };
  }
  const organizationId = getDB().organization.id;

  void searchBusinessesWithoutWebsite({
    segment,
    city: p.nationwide ? undefined : city,
    nationwide: p.nationwide,
    limit,
  }).then((places) => {
    if (!places.length) {
      toast.info(`Nenhum negócio real com WhatsApp foi encontrado para ${segment} em ${city}.`);
      return;
    }
    if (getDB().organization.id !== organizationId) {
      console.error("[Time Dev Maps] Workspace mudou antes da conclusão da busca.");
      toast.error("O workspace mudou durante a busca. Nenhum lead ou prévia foi salvo.");
      return;
    }
    const result = applyPresenceFromPlaces({ places, segment, city });
    toast.success(`${result.count} prévia(s) criada(s) com dados reais do Maps.`);
  }).catch((error: unknown) => {
    console.error("[Time Dev Maps]", error);
    toast.error("A busca no Maps falhou. Nenhum lead ou prévia foi criado.");
  });

  return {
    ok: true,
    message: `Busca real no Maps iniciada para ${segment} em ${p.nationwide ? "todo o Brasil" : city}. Leads e prévias só serão criados a partir de resultados encontrados.`,
    data: { segment, city, limit, status: "buscando" },
  };
}
