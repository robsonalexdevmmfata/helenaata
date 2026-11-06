import type {
  BuyIntent,
  CommercialDossier,
  Company,
  Contact,
  DB,
  EvidenceKind,
  IntelligenceEvidence,
  LeadTemperature,
  MatchedOffer,
  NextBestAction,
  NichePlay,
  OpportunityRisk,
  RoiScenario,
} from "@/lib/types";
import { cycleFromTags, diagnoseLead } from "@/lib/helena/diagnose";
import { wantsCardapio } from "@/lib/dev/presence";
import { currentUser, getDB, nowISO, uid, update } from "@/lib/store";
import { canUseDevTeam } from "@/lib/saas";
import { normalize } from "@/lib/format";
import {
  commercialHealth,
  detectContradictions,
  matchOffersByFit,
  recommendationConfidence,
  recoverOpportunities,
  shouldBlockApproach,
} from "@/lib/helena/decision";

export type LeakItem = {
  code: string;
  label: string;
  evidence: string;
  estimateHint: string;
};

const INTENT_RE = /quanto custa|qual o valor|quero contratar|manda (uma )?proposta|fechar|contratar|orçamento|orcamento|pode mandar|vamos fechar/i;

export function nichePlayOf(segment?: string, name?: string): NichePlay {
  const n = normalize(`${segment || ""} ${name || ""}`);
  if (wantsCardapio(n) || /pizzaria/.test(n)) return "pizzaria";
  if (/clinic|dentista|estetic|fisioter|odonto|medico|pet\b/.test(n)) return "clinica";
  if (/barbear|cabeleir|salao|salão|barbeiro/.test(n)) return "barbearia";
  return "outro";
}

export function defaultTicket(play: NichePlay) {
  if (play === "pizzaria") return 45;
  if (play === "barbearia") return 60;
  if (play === "clinica") return 180;
  return 150;
}

export function lostMoneyRadar(contact: Contact, company?: Company): LeakItem[] {
  const tags = contact.tags || [];
  const play = nichePlayOf(company?.segment, company?.name || contact.name);
  const items: LeakItem[] = [];
  const noSite = !company?.website?.trim() || tags.includes("#sem-site");
  if (noSite) {
    items.push({
      code: "sem_canal",
      label: play === "pizzaria" ? "Canal próprio de pedidos não identificado" : play === "clinica" ? "Canal de agendamento não identificado" : play === "barbearia" ? "Canal de reservas não identificado" : "Site próprio não identificado",
      evidence: "Não há website público no cadastro/OSM.",
      estimateHint: "Estimativa com premissa de 1 conversão extra por semana no canal próprio. Não é perda comprovada.",
    });
  }
  if (play === "pizzaria" && tags.includes("#sem-cardapio")) {
    items.push({
      code: "cardapio",
      label: "Cardápio digital / adicionais não encontrados",
      evidence: "Nicho de comida sem cardápio online no cadastro.",
      estimateHint: "Estimativa: ticket sobe quando adicional aparece no cardápio. Hipótese, não auditoria fiscal.",
    });
  }
  if (tags.includes("#sem-ia-whatsapp") || tags.includes("#sem-ia")) {
    items.push({
      code: "retorno",
      label: "Sem recuperação automática de quem some",
      evidence: "Atendimento sem rastro de chatbot/IA no cadastro.",
      estimateHint: "Estimativa: follow-up no horário comercial recupera parte do silêncio. Não inventamos R$ perdido.",
    });
  }
  return items;
}

export function competitorSnapshot(db: DB, company?: Company) {
  if (!company) return { peers: 0, withSite: 0, withoutSite: 0, line: "Sem empresa no cadastro para comparar.", rows: [] as CommercialDossier["competitors"] };
  const peers = db.companies.filter(
    (c) => c.id !== company.id && c.city === company.city && c.segment === company.segment,
  );
  const withSite = peers.filter((c) => Boolean(c.website?.trim())).length;
  const withoutSite = peers.filter((c) => !c.website?.trim()).length;
  const line = peers.length === 0
    ? `Nenhum concorrente da mesma cidade e segmento no cadastro — comparação limitada ao que foi coletado.`
    : withSite > withoutSite
      ? `Na mesma cidade/nicho, ${withSite} concorrentes no cadastro já mostram site. ${company.name}: canal próprio ${company.website?.trim() ? "observado" : "não identificado"}.`
      : `${withoutSite} negócios parecidos no cadastro também estão sem site — janela de chegar primeiro, com evidência só deste CRM.`;
  const rows = peers.slice(0, 6).map((c) => ({
    name: c.name,
    city: c.city,
    hasSite: Boolean(c.website?.trim()),
    note: c.website?.trim() ? `Site observado: ${c.website}` : "Site não encontrado no cadastro (não é certeza de que não existe).",
  }));
  return { peers: peers.length, withSite, withoutSite, line, rows };
}

export function roiScenarios(price: number, play: NichePlay, informedTicket?: number): { ticketSource: EvidenceKind; scenarios: RoiScenario[] } {
  const ticket = informedTicket && informedTicket > 0 ? informedTicket : defaultTicket(play);
  const ticketSource: EvidenceKind = informedTicket && informedTicket > 0 ? "stated_by_client" : "hypothesis";
  const mk = (name: RoiScenario["name"], mult: number): RoiScenario => {
    const t = Math.round(ticket * mult);
    const extraOrders = Math.max(1, Math.ceil(price / Math.max(1, t)));
    return {
      name,
      ticket: t,
      extraOrders,
      premise: `${ticketSource === "stated_by_client" ? "Ticket informado pelo estabelecimento" : "Ticket hipotético de nicho"} ${t.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. ${extraOrders} conversões extras pagam ${price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Não é garantia de faturamento.`,
    };
  };
  return { ticketSource, scenarios: [mk("conservador", 1), mk("intermediario", 1.15), mk("otimista", 1.3)] };
}

export function roiBreakEven(price: number, ticket = 45) {
  const pedidos = Math.max(1, Math.ceil(price / Math.max(1, ticket)));
  return {
    price,
    ticket,
    pedidos,
    line: `Estimativa: com ticket de ${ticket.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, ${pedidos} pedidos extras pagam o investimento de ${price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Não é garantia de venda.`,
  };
}

export function detectBuyIntent(db: DB, contactId: string): BuyIntent {
  const conv = db.conversations.find((c) => c.contactId === contactId);
  const texts = (conv?.messages || []).filter((m) => m.from === "contact").map((m) => m.text);
  if (texts.some((t) => INTENT_RE.test(t))) return "quente";
  if (texts.length > 0) return "interessado";
  return "frio";
}

function evidenceFromLead(contact: Contact, company: Company | undefined, collectedAt: string): IntelligenceEvidence[] {
  const tags = contact.tags || [];
  const play = nichePlayOf(company?.segment, company?.name || contact.name);
  const out: IntelligenceEvidence[] = [];
  const website = company?.website?.trim();
  if (website) {
    out.push({
      code: "site",
      label: "Website",
      observation: website,
      kind: "observed",
      source: "cadastro/OSM",
      collectedAt,
    });
  } else {
    out.push({
      code: "site",
      label: "Website",
      observation: "Não encontrado no cadastro. Ausência aqui não prova que o negócio não tenha página fora do mapa.",
      kind: "not_found",
      source: "cadastro/OSM",
      collectedAt,
    });
  }
  if (play === "pizzaria") {
    out.push({
      code: "cardapio",
      label: "Cardápio digital",
      observation: tags.includes("#sem-cardapio")
        ? "Tag #sem-cardapio no lead — cardápio online não identificado nesta coleta."
        : tags.includes("#com-cardapio")
          ? "Tag #com-cardapio observada."
          : "Cardápio não foi inspecionado nesta coleta.",
      kind: tags.includes("#com-cardapio") ? "observed" : tags.includes("#sem-cardapio") ? "not_found" : "hypothesis",
      source: "tags do diagnóstico",
      collectedAt,
    });
  }
  if (play === "clinica") {
    out.push({
      code: "agenda",
      label: "Agendamento público",
      observation: website
        ? "Há site; agenda online não foi verificada página a página nesta coleta."
        : "Sem site público — canal de agendamento não identificado.",
      kind: website ? "hypothesis" : "not_found",
      source: "cadastro",
      collectedAt,
    });
  }
  if (play === "barbearia") {
    out.push({
      code: "reserva",
      label: "Reservas / catálogo",
      observation: website ? "Site existe; catálogo e reserva não foram confirmados nesta coleta." : "Apresentação pública e reserva não identificadas no cadastro.",
      kind: website ? "hypothesis" : "not_found",
      source: "cadastro",
      collectedAt,
    });
  }
  return out;
}

export function mergeEvidenceHistory(prev: IntelligenceEvidence[] | undefined, next: IntelligenceEvidence[], history: IntelligenceEvidence[] | undefined) {
  const hist = [...(history || [])];
  for (const n of next) {
    const old = (prev || []).find((p) => p.code === n.code);
    if (old && (old.kind !== n.kind || old.observation !== n.observation)) {
      hist.push({ ...old, supersededAt: n.collectedAt });
    }
  }
  return hist.slice(-40);
}

export function matchCatalogOffers(db: DB, play: NichePlay, evidence: IntelligenceEvidence[]): MatchedOffer[] {
  return matchOffersByFit(db, play, evidence);
}

export function leadTemperature(contact: Contact, proposal?: { status: string }, intent: BuyIntent = "frio"): { label: LeadTemperature; reason: string } {
  const cycle = cycleFromTags(contact.tags);
  if (proposal && (proposal.status === "enviada" || proposal.status === "aguardando") || cycle === "reuniao") {
    return { label: "negociacao", reason: "Há proposta em jogo ou reunião no ciclo — não é lead frio." };
  }
  if (intent === "quente" || cycle === "respondeu") {
    return { label: "quente", reason: "O contato escreveu intenção ou respondeu no ciclo. Só o que está registrado." };
  }
  if (cycle === "diagnosticado" || cycle === "preview" || cycle === "link_enviado") {
    return { label: "morno", reason: `Ciclo em ${cycle || "diagnóstico"}: já há trabalho, ainda sem resposta de compra.` };
  }
  return { label: "frio", reason: "Sem resposta e sem proposta. Temperatura baseada no ciclo e nas mensagens, não em feeling." };
}

export function opportunityRisk(contact: Contact, proposal?: { status: string; sentAt?: string; createdAt: string }): { level: OpportunityRisk; reason: string } {
  const now = Date.now();
  const last = new Date(contact.lastContactAt || contact.createdAt).getTime();
  const hours = (now - last) / 3_600_000;
  if (proposal?.status === "enviada") {
    const sent = new Date(proposal.sentAt || proposal.createdAt).getTime();
    if (now - sent > 24 * 3_600_000) {
      return { level: "esfriando", reason: "Proposta enviada há mais de 24h sem novo contato registrado." };
    }
  }
  if (hours > 48 && cycleFromTags(contact.tags) && cycleFromTags(contact.tags) !== "reuniao" && cycleFromTags(contact.tags) !== "resultado") {
    return { level: "parada", reason: "Mais de 48h sem movimento no cadastro. Risco de perda, não certeza." };
  }
  return { level: "ok", reason: "Há movimento recente o suficiente para não marcar risco." };
}

export function nextBestAction(input: {
  contact: Contact;
  intent: BuyIntent;
  proposal?: { id: string; status: string };
  previewId?: string;
  hasDevTeam: boolean;
}): NextBestAction {
  const cycle = cycleFromTags(input.contact.tags);
  if (!cycle || cycle === "encontrado") {
    return { id: "diagnose", label: "Diagnosticar o negócio", reason: "Ainda não há dossiê completo. Sem diagnóstico a oferta seria genérica.", tool: "leads.diagnose", params: { contactId: input.contact.id }, needsApproval: false };
  }
  if (!input.previewId && input.hasDevTeam) {
    return { id: "preview", label: "Pedir prévia ao Time Dev", reason: "Diagnóstico existe e ainda não há prévia personalizada no cadastro.", tool: "dev.build_presence", params: { contactId: input.contact.id }, needsApproval: false };
  }
  if (!input.proposal) {
    return { id: "proposal", label: "Gerar proposta a partir do dossiê", reason: "Há diagnóstico (e prévia, se Máquina). Falta transformar em proposta do catálogo.", tool: "sales.draft_proposal", params: { contactId: input.contact.id }, needsApproval: false };
  }
  if (input.proposal.status === "rascunho" || input.proposal.status === "aguardando") {
    return { id: "send_proposal", label: "Pedir aprovação para enviar a proposta", reason: "Proposta pronta. Envio no WhatsApp é ação sensível.", tool: "sales.send_proposal", params: { proposalId: input.proposal.id }, needsApproval: true };
  }
  if (input.intent === "quente") {
    return { id: "meeting", label: "Agendar reunião de 10 minutos", reason: "O contato pediu preço/proposta/contratar por escrito.", tool: "calendar.agendar_reuniao", params: { leadId: input.contact.id }, needsApproval: false };
  }
  if (input.proposal.status === "enviada") {
    const block = shouldBlockApproach(input.contact);
    if (block.block) {
      return { id: "wait", label: "Não insistir agora", reason: block.reason, needsApproval: false };
    }
    return { id: "followup", label: "Follow-up da proposta sem resposta", reason: "Proposta saiu e não há intenção escrita nova. Retorno no horário comercial, com opt-out.", tool: "rpa.followup_schedule", params: { contactId: input.contact.id, kind: "sem_resposta" }, needsApproval: false };
  }
  return { id: "wait", label: "Aguardar o próximo sinal do contato", reason: "Não há gatilho novo no histórico. Empurrar agora seria teatro.", needsApproval: false };
}

export function commandCenter(db: DB) {
  const dossiers = (db.commercialDossiers || []).map((d) => {
    const contact = db.contacts.find((c) => c.id === d.contactId);
    if (!contact) return d;
    const proposal = (db.commercialProposals || []).find((p) => p.id === d.proposalId || p.contactId === d.contactId);
    const intent = d.intent || detectBuyIntent(db, d.contactId);
    return {
      ...d,
      intent,
      temperature: d.temperature || leadTemperature(contact, proposal, intent),
      risk: d.risk || opportunityRisk(contact, proposal),
    };
  });
  const proposals = db.commercialProposals || [];
  const cooling = dossiers.filter((d) => d.risk?.level === "esfriando" || d.risk?.level === "parada");
  const hot = dossiers.filter((d) => d.intent === "quente" || d.temperature?.label === "quente" || d.temperature?.label === "negociacao");
  const waiting = proposals.filter((p) => p.status === "enviada" || p.status === "aguardando");
  const today = dossiers
    .filter((d) => d.nextAction && d.nextAction.id !== "wait")
    .slice(0, 3)
    .map((d) => {
      const c = db.contacts.find((x) => x.id === d.contactId);
      const co = db.companies.find((x) => x.id === d.companyId);
      return { contactId: d.contactId, name: co?.name || c?.name || d.contactId, action: d.nextAction };
    });
  const won = db.deals.filter((d) => d.status === "ganho");
  const byOffer = new Map<string, number>();
  for (const deal of won) {
    const dos = dossiers.find((x) => x.contactId === deal.contactId);
    const key = dos?.matchedOffers?.[0]?.name || dos?.offer || "sem oferta no dossiê";
    byOffer.set(key, (byOffer.get(key) || 0) + 1);
  }
  const winning = [...byOffer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n }));
  return {
    dossiers: dossiers.length,
    cooling: cooling.length,
    hot: hot.length,
    waiting: waiting.length,
    today,
    winning,
    recover: recoverOpportunities(db),
    health: commercialHealth(db),
    temps: [
      { name: "Frio", value: dossiers.filter((d) => d.temperature?.label === "frio").length },
      { name: "Morno", value: dossiers.filter((d) => d.temperature?.label === "morno").length },
      { name: "Quente", value: dossiers.filter((d) => d.temperature?.label === "quente").length },
      { name: "Negociação", value: dossiers.filter((d) => d.temperature?.label === "negociacao").length },
    ],
  };
}

export function buildDossier(contactId: string, extras?: { informedTicket?: number; informedMonthly?: number }): CommercialDossier | null {
  const db = getDB();
  const contact = db.contacts.find((c) => c.id === contactId);
  if (!contact) return null;
  const company = db.companies.find((c) => c.id === contact.companyId);
  const collectedAt = nowISO();
  const play = nichePlayOf(company?.segment, company?.name || contact.name);
  const dx = diagnoseLead({
    name: company?.name || contact.name,
    segment: company?.segment,
    city: company?.city,
    website: company?.website,
    tags: contact.tags,
    hasWhatsApp: Boolean(contact.phone),
    hasMenu: (contact.tags || []).includes("#com-cardapio"),
  });
  const offerRow = db.serviceOffers?.find((o) => /site/i.test(o.name)) || db.serviceOffers?.[0];
  const offerPrice = offerRow?.price || 4900;
  const existing = (db.commercialDossiers || []).find((d) => d.contactId === contactId);
  const informedTicket = extras?.informedTicket ?? existing?.roi.informedTicket;
  const informedMonthly = extras?.informedMonthly ?? existing?.roi.informedMonthly;
  const roi = roiScenarios(offerPrice, play, informedTicket);
  const rivals = competitorSnapshot(db, company);
  const intent = detectBuyIntent(db, contactId);
  const preview = (db.sitePreviews || []).find((p) => p.companyId === company?.id);
  const proposal = (db.commercialProposals || []).find((p) => p.contactId === contactId);
  const evidence = evidenceFromLead(contact, company, collectedAt);
  const evidenceHistory = mergeEvidenceHistory(existing?.evidence, evidence, existing?.evidenceHistory);
  const matchedOffers = matchCatalogOffers(db, play, evidence);
  const primary = matchedOffers[0];
  const temperature = leadTemperature(contact, proposal, intent);
  const risk = opportunityRisk(contact, proposal);
  const contradictions = detectContradictions(evidence, contact.tags);
  const confidence = recommendationConfidence(evidence, matchedOffers);
  const nextAction = nextBestAction({
    contact,
    intent,
    proposal: proposal ? { id: proposal.id, status: proposal.status } : undefined,
    previewId: preview?.id,
    hasDevTeam: canUseDevTeam(currentUser(db)),
  });
  const row: CommercialDossier = {
    id: existing?.id || uid("dos_"),
    organizationId: db.organization.id,
    contactId,
    companyId: company?.id,
    nichePlay: play,
    collectedAt,
    evidence,
    evidenceHistory,
    reputation: {
      pattern: "Nenhuma avaliação pública foi importada nesta coleta. Sem nota, não afirmamos reputação boa ou ruim.",
      kind: "not_found",
    },
    competitors: rivals.rows,
    offer: primary?.name || dx.recommend_offer,
    approach: dx.recommend_pitch,
    roi: {
      offerPrice: primary?.price || offerPrice,
      informedTicket,
      informedMonthly,
      ticketSource: roi.ticketSource,
      scenarios: roi.scenarios,
    },
    intent,
    temperature,
    risk,
    nextAction,
    matchedOffers,
    contradictions,
    confidence,
    previewId: preview?.id,
    proposalId: proposal?.id,
  };
  update((d) => {
    if (!Array.isArray(d.commercialDossiers)) d.commercialDossiers = [];
    const i = d.commercialDossiers.findIndex((x) => x.contactId === contactId);
    if (i >= 0) d.commercialDossiers[i] = row;
    else d.commercialDossiers.unshift(row);
    const c = d.contacts.find((x) => x.id === contactId);
    if (c) {
      const rest = (c.tags || []).filter((t) => !t.startsWith("#intencao-"));
      c.tags = [...rest, `#intencao-${intent}`];
    }
  });
  return row;
}

export function intelligenceForLead(db: DB, contact: Contact) {
  const company = db.companies.find((c) => c.id === contact.companyId);
  const stored = (db.commercialDossiers || []).find((d) => d.contactId === contact.id);
  const leaks = lostMoneyRadar(contact, company);
  const rival = competitorSnapshot(db, company);
  const play = nichePlayOf(company?.segment, company?.name || contact.name);
  const offer = db.serviceOffers?.find((o) => /site/i.test(o.name)) || db.serviceOffers?.[0];
  const roi = roiBreakEven(offer?.price || 4900, stored?.roi.informedTicket || defaultTicket(play));
  return { contact, company, leaks, rival, roi, dossier: stored };
}
