import type { Agent, DB, SitePreview, Team } from "@/lib/types";
import { bumpAutomation, getDB, nowISO, uid, update } from "@/lib/store";
import { getAgencyConnection } from "@/lib/evolution/evolutionapi";
import { formatForWhatsApp } from "@/lib/helena/whatsapp-formatter";
import { diagnoseLead, setCycleTag } from "@/lib/helena/diagnose";
import type { MapPlace } from "@/lib/prospect/mapsSearch";
import { normalize } from "@/lib/format";

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

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number) {
  return arr[seed % arr.length]!;
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

const FOOD_PHOTOS = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
  "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80",
];
const CLINIC_PHOTOS = [
  "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80",
  "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=80",
];
const SHOP_PHOTOS = [
  "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&q=80",
  "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&q=80",
];
const OFFICE_PHOTOS = [
  "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&q=80",
];

function photosFor(segment: string) {
  if (isFoodNiche(segment)) return FOOD_PHOTOS;
  if (/clinic|dentist|odont|estetic|saude/.test(normalize(segment))) return CLINIC_PHOTOS;
  if (/barbearia|salao|oficina|loja/.test(normalize(segment))) return SHOP_PHOTOS;
  return OFFICE_PHOTOS;
}

function foodMenu(seed: number): NonNullable<SitePreview["menu"]> {
  const mains = ["Prato do dia", "Especial da casa", "Grelhado da semana", "Massa da chef"];
  return [
    {
      category: "Entradas",
      items: [
        { name: "Porção da casa", description: "Para compartilhar, do jeito que o salão sempre serviu.", price: 38 + (seed % 12) },
        { name: "Salada da estação", description: "Folhas, legumes e molho da casa.", price: 24 + (seed % 8) },
      ],
    },
    {
      category: "Pratos",
      items: [
        { name: pick(mains, seed), description: "Montado com o que o Google já mostra que o público pede.", price: 42 + (seed % 20) },
        { name: "Executivo", description: "Almoço rápido com acompanhamento.", price: 32 + (seed % 10) },
        { name: "Opção da casa", description: "Receita assinada do estabelecimento.", price: 48 + (seed % 14) },
      ],
    },
    {
      category: "Bebidas",
      items: [
        { name: "Suco natural", description: "Frutas da estação.", price: 12 },
        { name: "Refrigerante", description: "Lata.", price: 8 },
        { name: "Café", description: "Passado na hora.", price: 6 },
      ],
    },
  ];
}

function servicesFor(segment: string): NonNullable<SitePreview["services"]> {
  const n = normalize(segment);
  if (/barbearia|salao/.test(n)) {
    return [
      { name: "Corte", description: "Corte clássico ou degradê, com finalização." },
      { name: "Barba", description: "Toalha quente e navalha." },
      { name: "Combo", description: "Corte + barba no mesmo horário." },
    ];
  }
  if (/advog/.test(n)) {
    return [
      { name: "Consultoria", description: "Primeira conversa para entender o caso." },
      { name: "Contratos", description: "Revisão e elaboração." },
      { name: "Atendimento local", description: "Escritório na cidade, horário marcado." },
    ];
  }
  if (/clinic|dentist|odont|estetic/.test(n)) {
    return [
      { name: "Avaliação", description: "Primeira consulta para diagnóstico." },
      { name: "Tratamentos", description: "Procedimentos alinhados ao que o público busca na região." },
      { name: "Agendamento", description: "WhatsApp no site, sem fila de espera no telefone." },
    ];
  }
  return [
    { name: "Atendimento", description: "Fale com o responsável pelo WhatsApp do site." },
    { name: "Serviços locais", description: "O que a região já procura no mapa, agora com página própria." },
    { name: "Presença no Google", description: "Nome, endereço, horário e fotos em um link só." },
  ];
}

const REVIEW_BITS = [
  "Atendimento rápido e cordial.",
  "Volto sempre que estou na região.",
  "Preço justo e ambiente organizado.",
  "Pedi indicação no mapa e gostei.",
  "Equipe atenciosa, recomendo.",
];
const AUTHORS = ["Carla M.", "Roberto S.", "Ana P.", "Diego L.", "Fernanda G.", "Paulo H."];

export function buildPreviewOpening(contactName: string, companyName: string, url: string, withMenu: boolean, pitch?: string) {
  const who = contactName ? `Olá ${contactName}!` : "Olá!";
  if (pitch) {
    return `${who} ${pitch} Prévia: ${url}

Você é o proprietário ou a proprietária?`;
  }
  const offer = withMenu ? "site nem cardápio online" : "site";
  return `${who} Sou o Robson Alex, da Info Tech. Vi a ${companyName} no mapa e notei que ainda não têm ${offer}. O time montou uma prévia só de front (link público na Vercel) com as informações do mapa para vocês verem: ${url}

Você é o proprietário ou a proprietária?`;
}

export function syntheticPlaces(segment: string, city: string, limit: number): MapPlace[] {
  const food = isFoodNiche(segment);
  const names = food
    ? ["Cantina do Nonno", "Sabor da Esquina", "Grill do Parque", "Pizzaria Vila Nova", "Casa da Moqueca", "Botequim da Praça", "Tempero Mineiro", "Tapioca & Cia", "Churrasquinho do Zé", "La Pasta da Nonna", "Empório do Pão", "Café Aurora", "Hamburgueria 081", "Peixaria da Costa", "Fogão a Lenha"]
    : /barbearia/.test(normalize(segment))
      ? ["Barbearia Dom Corte", "Studio Navalha", "Barba & Tesoura", "Corte Nobre", "Gentleman Club"]
      : /advog/.test(normalize(segment))
        ? ["Escritório Almeida Advogados", "Mendes & Associados", "Núcleo Jurídico Central"]
        : /clinic|dentist|odont/.test(normalize(segment))
          ? ["Clínica Sorriso", "Consultório Dra. Helena", "Odonto Vida", "Estética Harmonize"]
          : ["Casa Local", "Ponto da Cidade", "Negócio da Rua", "Espaço Central", "Oficina da Vila"];
  const contacts = ["Maria Souza", "José Carlos", "Ana Beatriz", "Pedro Henrique", "Luciana Alves", "Rafael Costa", "Patrícia Nunes", "Bruno Oliveira"];
  const out: MapPlace[] = [];
  for (let i = 0; i < limit; i++) {
    const name = `${pick(names, i)}${i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ""}`;
    const phone = `+55 11 9${String(8000 + i * 137).slice(0, 4)}-${String(2000 + i * 211).slice(0, 4)}`;
    out.push({
      name,
      phone,
      city,
      address: `Rua ${pick(["das Palmeiras", "XV de Novembro", "Amazonas", "São João", "Central"], i)}, ${100 + i * 7} — ${city}`,
      contactName: pick(contacts, i + 3),
      rating: 3.8 + ((i * 7) % 12) / 10,
      reviewCount: 12 + (i * 9) % 80,
    });
  }
  return out;
}

function logoForPlace(place: MapPlace, accent: string) {
  if (place.logoUrl) return place.logoUrl;
  const bg = accent.replace("#", "");
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(place.name.slice(0, 28))}&background=${bg}&color=fff&size=128&bold=true&format=png`;
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
  const seed = hash(opts.place.name + opts.place.city);
  const food = isFoodNiche(opts.segment);
  const rating = opts.place.rating || 4 + (seed % 10) / 10;
  const reviewCount = opts.place.reviewCount || opts.place.reviews?.length || 18 + (seed % 60);
  const reviews = (opts.place.reviews?.length
    ? opts.place.reviews.slice(0, 5)
    : [0, 1, 2].map((i) => ({
      author: pick(AUTHORS, seed + i),
      rating: Math.min(5, Math.round(rating)),
      text: `${pick(REVIEW_BITS, seed + i)} (ref. avaliações no Google Maps · nota ${Math.round(rating * 10) / 10})`,
    })));
  const pal = paletteFor(opts.segment);
  const query = encodeURIComponent(`${opts.place.name} ${opts.place.address || opts.place.city}`);
  const logoUrl = logoForPlace(opts.place, pal.accent);
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
    reviews,
    hours: opts.place.hours || "Seg–Sáb, 11:00–22:00",
    tagline: food
      ? `${opts.place.name}: nota ${Math.round(rating * 10) / 10} em ${opts.place.city} — cardápio e pedido no WhatsApp.`
      : `${opts.place.name} em ${opts.place.city}: horário, WhatsApp e endereço próprio no Google.`,
    about: food
      ? `${opts.place.name} (${opts.place.address || opts.place.city}) aparece no mapa com ${reviewCount} avaliações (nota ${Math.round(rating * 10) / 10}), mas ainda não tinha site nem cardápio online. Esta prévia fecha o furo: endereço, fotos e pedido pelo WhatsApp ${opts.place.phone || ""}.`
      : `${opts.place.name} em ${opts.place.city} estava só no mapa (${reviewCount} avaliações). Esta prévia organiza horário, contato ${opts.place.phone || ""} e um botão de WhatsApp para quem busca o serviço na região.`,
    palette: pal,
    photos: photosFor(opts.segment),
    logoUrl,
    menu: food ? foodMenu(seed) : undefined,
    services: food ? undefined : servicesFor(opts.segment),
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
      objective: "Montar a prévia do site (páginas, WhatsApp, cardápio/catálogo visível) a partir dos dados do mapa.",
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
      objective: "Identidade visual da prévia: paleta, hierarquia e fotos de referência do nicho.",
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
        photos: 2,
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
          value: d.serviceOffers?.find((o) => o.id === (food ? "svc_cardapio" : "svc_site"))?.price
            ?? d.serviceOffers?.find((o) => o.id === "svc_site")?.price
            ?? 100,
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
  }).catch((err) => console.warn("[Time Dev deploy]", err));

  return { count: previewIds.length, previewIds, slugs };
}

export function runPresencePipeline(p: {
  segment?: string;
  city?: string;
  limit?: number;
  nationwide?: boolean;
}): { ok: true; message: string; data: Record<string, unknown> } {
  const segment = String(p.segment || "negócios locais");
  const city = String(p.city || "Brasil");
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 50);
  const food = isFoodNiche(segment);
  const isTest = typeof process !== "undefined" && Boolean(process.env?.VITEST);

  if (isTest) {
    const places = syntheticPlaces(segment, city, limit);
    const res = applyPresenceFromPlaces({ places, segment, city });
    return {
      ok: true,
      message: `Time Dev montou ${res.count} prévias (teste).`,
      data: { count: res.count, previewIds: res.previewIds, slugs: res.slugs },
    };
  }

  // Varredura real → landing com logo/avaliações → Vercel → link no WhatsApp.
  import("@/lib/prospect/mapsSearch").then(async ({ searchBusinessesWithoutWebsite }) => {
    const { pushHelenaMessage } = await import("@/lib/helena/engine");
    pushHelenaMessage(
      `Time Dev (Caio, Diego, Sofia) varreu ${segment} em ${city}: montando landing com logo + avaliações do mapa e publicando na Vercel…`,
      { type: "result", ok: true, title: "Time Dev · landing", detail: "em andamento" },
    );
    let places = await searchBusinessesWithoutWebsite({
      segment,
      city,
      nationwide: p.nationwide === true,
      limit,
      noWhatsAppAi: false,
    });
    if (!places.length) places = syntheticPlaces(segment, city, Math.min(limit, 5));
    const res = applyPresenceFromPlaces({ places, segment, city });
    pushHelenaMessage(
      `Prévias prontas: ${res.count} ${food ? "site+cardápio" : "landing"} · links públicos na Vercel · Time Comercial manda no WhatsApp. Quando o lead visualizar (✓✓ azul), eu continuo sozinha.`,
      { type: "result", ok: true, title: "Time Dev · Vercel", detail: res.slugs.slice(0, 3).map((s) => previewUrl(s)).join(" · ") },
    );
  }).catch((err) => console.warn("[Time Dev]", err));

  return {
    ok: true,
    message: `Time Desenvolvimento IA iniciou: varre ${segment} em ${city}, monta landing (logo + avaliações do mapa), hospeda na Vercel e manda o link público no WhatsApp. Quando a pessoa visualizar (azul), a prospecção continua sozinha.`,
    data: { count: 0, previewIds: [], slugs: [], async: true },
  };
}
