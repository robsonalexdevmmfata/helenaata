import type {
  CommercialContradiction,
  CommercialDecision,
  CommercialDossier,
  Contact,
  DB,
  IntelligenceEvidence,
  MatchedOffer,
  OpportunitySimRow,
  RecommendationConfidence,
  ServiceOffer,
} from "@/lib/types";
import { cycleFromTags } from "@/lib/helena/diagnose";
import { currentUser, getDB, nowISO, uid, update } from "@/lib/store";
import { dailyLimitFor, prospectsUsedToday } from "@/lib/saas";
import { isOptedOut } from "@/lib/whatsapp/antiban";
import { brl, normalize } from "@/lib/format";
import type { NichePlay } from "@/lib/types";

function activeOffers(db: DB) {
  return (db.serviceOffers || []).filter((o) => o.active);
}

export function offerFitScore(offer: ServiceOffer, play: NichePlay, evidence: IntelligenceEvidence[]): { score: number; why: string } {
  const n = normalize(`${offer.name} ${offer.category} ${offer.description}`);
  const site = evidence.find((e) => e.code === "site");
  const hasSite = site?.kind === "observed";
  const noSite = site?.kind === "not_found";
  const menu = evidence.find((e) => e.code === "cardapio");
  const noMenu = menu?.kind === "not_found";
  let score = 20;
  let why = "Item ativo do catálogo. Adequação baixa até cruzar evidência.";

  if (play === "pizzaria") {
    if (noMenu && /atendente virtual|whatsapp|landing/i.test(n)) {
      score = 88;
      why = "Pizzaria sem cardápio/canal de pedido identificado: o catálogo tem atendimento e página de conversão — não um site novo se já existir presença.";
    }
    if (noSite && /site institucional/i.test(n)) {
      score = 92;
      why = "Site não encontrado no cadastro. Site institucional do catálogo casa com a lacuna observada.";
    }
    if (hasSite && /site institucional/i.test(n)) {
      score = 12;
      why = "Já há site observado. Oferecer outro site institucional seria proposta sem sentido.";
    }
    if (hasSite && noMenu && /landing/i.test(n)) {
      score = 70;
      why = "Há site, mas cardápio/pedido não identificado. Landing de conversão pode complementar — não substitui o site existente.";
    }
  }
  if (play === "clinica" || play === "barbearia") {
    if (noSite && /site institucional|agendamento/i.test(n)) {
      score = 90;
      why = `${play}: canal público não identificado. Item do catálogo cobre presença e reserva.`;
    }
    if (hasSite && /agendamento/i.test(n)) {
      score = 78;
      why = "Site observado; agenda pública não foi confirmada. Agendamento do catálogo é o encaixe, não outro site.";
    }
    if (hasSite && /site institucional/i.test(n) && !/agendamento/i.test(n)) {
      score = 18;
      why = "Site já observado. Site institucional novo não é a oferta adequada.";
    }
  }
  if (/atendente virtual|whatsapp/i.test(n) && score < 60) {
    score = Math.max(score, 55);
    why = "WhatsApp no catálogo fecha o ciclo de abordagem, independente do nicho.";
  }
  return { score, why };
}

export function matchOffersByFit(db: DB, play: NichePlay, evidence: IntelligenceEvidence[]): MatchedOffer[] {
  const ranked = activeOffers(db)
    .map((o) => {
      const { score, why } = offerFitScore(o, play, evidence);
      return { offerId: o.id, name: o.name, why, price: o.price, fitScore: score };
    })
    .filter((o) => o.fitScore >= 40)
    .sort((a, b) => b.fitScore - a.fitScore);
  if (ranked.length) return ranked.slice(0, 3);
  const fallback = activeOffers(db)[0];
  if (!fallback) return [];
  return [{
    offerId: fallback.id,
    name: fallback.name,
    why: "Nenhum item cruzou forte com a evidência; usamos o primeiro serviço ativo — não inventamos oferta.",
    price: fallback.price,
    fitScore: 30,
  }];
}

export function detectContradictions(evidence: IntelligenceEvidence[], tags: string[] = []): CommercialContradiction[] {
  const out: CommercialContradiction[] = [];
  const site = evidence.find((e) => e.code === "site");
  if (site?.kind === "observed" && tags.includes("#sem-site")) {
    out.push({
      code: "site_vs_tag",
      detail: `Website observado (${site.observation}) e a tag #sem-site ainda está no lead. Fonte ${site.source} em ${site.collectedAt}. Precisa de nova verificação — não apagamos a tag sozinhos.`,
    });
  }
  if (site?.kind === "not_found" && tags.includes("#com-site")) {
    out.push({
      code: "tag_site_sem_url",
      detail: "Tag #com-site no cadastro, mas o dossiê não encontrou URL. Hipótese vs observação em conflito.",
    });
  }
  const menu = evidence.find((e) => e.code === "cardapio");
  if (menu?.kind === "observed" && tags.includes("#sem-cardapio")) {
    out.push({
      code: "cardapio_vs_tag",
      detail: "Cardápio marcado como observado e a tag #sem-cardapio permanece. Conservar as duas fontes até alguém conferir.",
    });
  }
  return out;
}

export function recommendationConfidence(evidence: IntelligenceEvidence[], offers: MatchedOffer[]): RecommendationConfidence {
  const observed = evidence.filter((e) => e.kind === "observed").length;
  const stated = evidence.filter((e) => e.kind === "stated_by_client").length;
  const hypo = evidence.filter((e) => e.kind === "hypothesis").length;
  const missing = evidence.filter((e) => e.kind === "not_found").length;
  const score = Math.min(100, observed * 28 + stated * 22 + Math.min(hypo, 2) * 8 - missing * 4);
  const level: RecommendationConfidence["level"] = score >= 70 ? "alta" : score >= 40 ? "media" : "baixa";
  const favors = [
    ...evidence.filter((e) => e.kind === "observed").map((e) => `${e.label}: ${e.observation}`),
    ...offers.slice(0, 1).map((o) => `Catálogo: ${o.name} (fit ${o.fitScore})`),
  ];
  const limits = [
    ...evidence.filter((e) => e.kind === "hypothesis" || e.kind === "not_found").map((e) => `${e.label} (${e.kind})`),
    "Confiança mede qualidade da evidência, não probabilidade de o cliente comprar.",
  ];
  return {
    score: Math.max(0, score),
    level,
    favors: favors.slice(0, 4),
    limits: limits.slice(0, 5),
    note: "Não confundir confiança da recomendação com chance de fechamento.",
  };
}

export function minPriceFor(offer: ServiceOffer) {
  if (offer.costAmount == null || offer.costAmount < 0) {
    return { ready: false as const, note: "Custo não cadastrado neste serviço. Sem preço mínimo inventado." };
  }
  const margin = offer.desiredMarginPct != null ? offer.desiredMarginPct / 100 : 0.3;
  const min = Math.round(offer.costAmount / Math.max(0.05, 1 - margin));
  const maxDiscount = offer.price > min ? Math.round(((offer.price - min) / offer.price) * 100) : 0;
  return {
    ready: true as const,
    min,
    maxDiscount,
    note: `Custo informado ${brl(offer.costAmount)} · margem desejada ${Math.round(margin * 100)}% · mínimo ${brl(min)}. Desconto acima de ${maxDiscount}% fica abaixo do mínimo cadastrado.`,
  };
}

export function capacityFor(db: DB, offer: ServiceOffer) {
  const open = db.deals.filter((d) => d.status === "aberto" && normalize(d.title).includes(normalize(offer.name).slice(0, 12))).length;
  if (offer.monthlyCapacity == null) {
    return { open, overloaded: false, note: "Capacidade mensal não cadastrada neste serviço. A Helena não bloqueia venda por chute." };
  }
  const overloaded = open >= offer.monthlyCapacity;
  return {
    open,
    cap: offer.monthlyCapacity,
    overloaded,
    note: overloaded
      ? `${open} projetos abertos neste serviço × teto ${offer.monthlyCapacity}/mês. Recomendar fila ou outro item do catálogo.`
      : `${open}/${offer.monthlyCapacity} em andamento neste serviço (deals abertos cujo título cita a oferta).`,
  };
}

export function commercialScope(offer: ServiceOffer) {
  return {
    included: [offer.description, offer.pitch].filter(Boolean),
    excluded: ["Tudo que não está na descrição cadastrada desta oferta."],
    materials: "Logotipo, textos e fotos que o cliente enviar — a Helena não inventa o que falta.",
    doneWhen: "Quando o entregável descrito no catálogo for confirmado no cadastro pelo assinante.",
    revisionsNote: "Quantidade de revisões só entra se o assinante cadastrar. Aqui não há número inventado.",
  };
}

export function commercialReadiness(db: DB, offer: ServiceOffer) {
  const gaps: string[] = [];
  if (!offer.active) gaps.push("Serviço inativo no catálogo.");
  if (!(offer.price > 0) && offer.billing !== "a_partir") gaps.push("Preço não definido.");
  if (!offer.description.trim()) gaps.push("Escopo/descrição vazia.");
  if (offer.costAmount == null) gaps.push("Custo não informado — margem desconhecida.");
  if (offer.monthlyCapacity == null) gaps.push("Capacidade mensal não informada.");
  const cap = capacityFor(db, offer);
  if (cap.overloaded) gaps.push(cap.note);
  return {
    ready: gaps.length === 0,
    gaps,
    note: gaps.length ? "Não recomendar envio até o assinante completar o cadastro." : "Preço, escopo e capacidade cadastrados.",
  };
}

export function simulateOpportunities(db: DB, play: NichePlay, evidence: IntelligenceEvidence[]): OpportunitySimRow[] {
  const matched = matchOffersByFit(db, play, evidence);
  const byId = new Map(activeOffers(db).map((o) => [o.id, o]));
  const rows: OpportunitySimRow[] = matched.map((m) => {
    const offer = byId.get(m.offerId)!;
    const min = minPriceFor(offer);
    const cap = capacityFor(db, offer);
    return {
      id: m.offerId,
      label: m.name,
      offerIds: [m.offerId],
      price: m.price,
      fitScore: m.fitScore,
      marginNote: min.note,
      capacityNote: cap.note,
      premise: `${m.why} Preço de tabela ${brl(m.price)}. Não é previsão de aceite.`,
    };
  });
  if (matched.length >= 2) {
    const a = matched[0];
    const b = matched[1];
    const oa = byId.get(a.offerId);
    const ob = byId.get(b.offerId);
    if (oa && ob) {
      rows.unshift({
        id: `pack_${a.offerId}_${b.offerId}`,
        label: `${a.name} + ${b.name}`,
        offerIds: [a.offerId, b.offerId],
        price: a.price + b.price,
        fitScore: Math.round((a.fitScore + b.fitScore) / 2),
        marginNote: "Pacote soma preços de tabela. Custos só se ambos tiverem custo cadastrado.",
        capacityNote: "Pacote usa a capacidade dos dois serviços — ver cada um.",
        premise: "Combinação só com itens ativos do catálogo. Não promete conversão maior.",
      });
    }
  }
  return rows.slice(0, 4);
}

export function qualityIssues(db: DB, dossier: CommercialDossier, contact: Contact) {
  const issues: { code: string; detail: string }[] = [];
  const contradictions = dossier.contradictions || [];
  const confidence = dossier.confidence;
  if (contradictions.length) issues.push({ code: "contradicao", detail: `${contradictions.length} contradição(ões) no dossiê.` });
  if (confidence?.level === "baixa") issues.push({ code: "evidencia_fraca", detail: "Diagnóstico com pouca evidência observada. Não tratar como fato." });
  const catalogIds = new Set(activeOffers(db).map((o) => o.id));
  for (const o of dossier.matchedOffers || []) {
    if (!catalogIds.has(o.offerId)) issues.push({ code: "fora_catalogo", detail: `Oferta ${o.name} não está no catálogo ativo.` });
  }
  if (isOptedOut(contact) && dossier.nextAction?.tool === "rpa.followup_schedule") {
    issues.push({ code: "optout", detail: "Opt-out/consentimento: follow-up não deve sair." });
  }
  const last = new Date(contact.lastContactAt || contact.createdAt).getTime();
  if (Date.now() - last < 6 * 3_600_000 && dossier.nextAction?.id === "followup") {
    issues.push({ code: "abordagem_recente", detail: "Contato há menos de 6h. Insistir agora seria abordagem repetida." });
  }
  return issues;
}

export function shouldBlockApproach(contact: Contact) {
  if (isOptedOut(contact)) return { block: true, reason: "Opt-out ou sem consentimento." };
  const last = new Date(contact.lastContactAt || contact.createdAt).getTime();
  if (Date.now() - last < 4 * 3_600_000) return { block: true, reason: "Já houve contato recente (menos de 4h). Evita duplicidade." };
  return { block: false, reason: "" };
}

export function recoverOpportunities(db: DB) {
  const out: { contactId: string; name: string; why: string; action: string }[] = [];
  for (const d of db.commercialDossiers || []) {
    const contact = db.contacts.find((c) => c.id === d.contactId);
    if (!contact || isOptedOut(contact)) continue;
    const company = db.companies.find((c) => c.id === d.companyId);
    const name = company?.name || contact.name;
    const proposal = (db.commercialProposals || []).find((p) => p.contactId === d.contactId);
    const cycle = cycleFromTags(contact.tags);
    if ((cycle === "diagnosticado" || cycle === "preview") && !proposal) {
      out.push({ contactId: contact.id, name, why: "Diagnóstico existe e ainda não há proposta no cadastro.", action: "Gerar proposta do catálogo" });
    } else if (proposal?.status === "enviada") {
      const sent = new Date(proposal.sentAt || proposal.createdAt).getTime();
      if (Date.now() - sent > 24 * 3_600_000) {
        out.push({ contactId: contact.id, name, why: "Proposta enviada há mais de 24h sem novo status.", action: "Follow-up com opt-out" });
      }
    } else if (d.intent === "quente" && proposal && proposal.status !== "aceita") {
      out.push({ contactId: contact.id, name, why: "Intenção escrita de compra e proposta ainda não aceita.", action: "Agendar reunião" });
    }
  }
  return out.slice(0, 12);
}

export function recordDecision(input: {
  contactId: string;
  actionId: string;
  label: string;
  reason: string;
  status: CommercialDecision["status"];
  outcome?: CommercialDecision["outcome"];
}) {
  const db = getDB();
  const row: CommercialDecision = {
    id: uid("dec_"),
    organizationId: db.organization.id,
    contactId: input.contactId,
    actionId: input.actionId,
    label: input.label,
    reason: input.reason,
    status: input.status,
    outcome: input.outcome,
    createdAt: nowISO(),
    decidedAt: input.status === "recomendada" ? undefined : nowISO(),
  };
  update((d) => {
    if (!Array.isArray(d.commercialDecisions)) d.commercialDecisions = [];
    d.commercialDecisions.unshift(row);
  });
  return row;
}

export function adaptiveLearning(db: DB) {
  const rows = (db.commercialDecisions || []).filter((x) => x.outcome === "ganho" || x.outcome === "perdido");
  if (rows.length < 5) {
    return { ready: false, note: `Aprendizado adaptativo exige pelo menos 5 decisões com resultado nesta organização (há ${rows.length}). Sem volume, a Helena não afirma padrão.`, patterns: [] as { actionId: string; won: number; lost: number }[] };
  }
  const map = new Map<string, { won: number; lost: number }>();
  for (const r of rows) {
    const cur = map.get(r.actionId) || { won: 0, lost: 0 };
    if (r.outcome === "ganho") cur.won += 1;
    else cur.lost += 1;
    map.set(r.actionId, cur);
  }
  const patterns = [...map.entries()].map(([actionId, v]) => ({ actionId, ...v })).sort((a, b) => b.won - a.won);
  return { ready: true, note: "Padrões só desta organização. Sem misturar contas.", patterns };
}

export function territorySnapshot(db: DB) {
  const map = new Map<string, number>();
  for (const c of db.companies) {
    const key = `${c.city || "sem cidade"} · ${c.segment || "sem segmento"}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, n]) => ({ label, n }));
  return { rows, note: rows.length ? "Concentração no cadastro atual." : "Nenhuma empresa no cadastro." };
}

export function consumptionSnapshot(db: DB) {
  const user = currentUser(db);
  const used = prospectsUsedToday(user);
  const limit = dailyLimitFor(user);
  const day = new Date().toISOString().slice(0, 10);
  const execToday = (db.executions || []).filter((e) => e.at?.startsWith(day)).length;
  const dxToday = (db.executions || []).filter((e) => e.at?.startsWith(day) && e.action === "leads.diagnose").length;
  const rpa = (db.rpaJobs || []).filter((j) => (j.createdAt || "").startsWith(day)).length;
  const msgs = (db.executions || []).filter((e) => e.at?.startsWith(day) && e.action === "messages.send").length;
  return {
    used,
    limit,
    execToday,
    dxToday,
    rpa,
    msgs,
    dossiers: (db.commercialDossiers || []).length,
    note: "Contagens desta conta, hoje. Sem número de marketing.",
  };
}

export function commercialHealth(db: DB) {
  const rec = recoverOpportunities(db);
  const cooling = (db.commercialDossiers || []).filter((d) => d.risk?.level === "esfriando" || d.risk?.level === "parada").length;
  const user = currentUser(db);
  const used = prospectsUsedToday(user);
  const limit = Math.max(1, dailyLimitFor(user));
  if (!(db.commercialDossiers || []).length && used === 0) {
    return { label: "sem movimento", detail: "Ainda não há dossiê nem prospecção hoje. Saúde não se inventa." };
  }
  if (used / limit >= 0.9) return { label: "sobrecarregada", detail: `Cota ${used}/${limit} no dia. Priorize follow-up em vez de achar mais lead.` };
  if (cooling >= 3 || rec.length >= 5) return { label: "perdendo oportunidades", detail: `${cooling} esfriando · ${rec.length} para recuperar no cadastro.` };
  return { label: "saudável", detail: "Há movimento e a fila de recuperação ainda é curta." };
}

export function universalSearch(db: DB, q: string) {
  const s = normalize(q);
  if (s.length < 2) return [] as { kind: string; id: string; label: string; to: string }[];
  const hits: { kind: string; id: string; label: string; to: string }[] = [];
  for (const c of db.contacts) {
    if (normalize(`${c.name} ${c.phone} ${c.email}`).includes(s)) {
      hits.push({ kind: "contato", id: c.id, label: c.name, to: `/crm/dossie/${c.id}` });
    }
  }
  for (const c of db.companies) {
    if (normalize(`${c.name} ${c.city} ${c.segment}`).includes(s)) {
      hits.push({ kind: "empresa", id: c.id, label: `${c.name} · ${c.city}`, to: "/crm/empresas" });
    }
  }
  for (const p of db.commercialProposals || []) {
    if (normalize(`${p.title} ${p.offer}`).includes(s)) {
      hits.push({ kind: "proposta", id: p.id, label: `${p.title} (${p.status})`, to: `/crm/sala/${p.contactId}` });
    }
  }
  for (const d of db.commercialDossiers || []) {
    if (normalize(`${d.offer} ${d.nichePlay}`).includes(s)) {
      const contact = db.contacts.find((c) => c.id === d.contactId);
      hits.push({ kind: "dossiê", id: d.id, label: contact?.name || d.contactId, to: `/crm/dossie/${d.contactId}` });
    }
  }
  return hits.slice(0, 20);
}

export function copilotAnswer(db: DB, question: string) {
  const q = normalize(question);
  const dossiers = db.commercialDossiers || [];
  if (/pizzaria/.test(q) && /diagnost/.test(q) && /proposta/.test(q)) {
    const rows = dossiers.filter((d) => d.nichePlay === "pizzaria" && !d.proposalId);
    if (!rows.length) return "Nenhuma pizzaria diagnosticada sem proposta neste cadastro.";
    return rows.map((d) => {
      const c = db.contacts.find((x) => x.id === d.contactId);
      const co = db.companies.find((x) => x.id === d.companyId);
      return `${co?.name || c?.name}: ${d.nextAction.label} (${d.nextAction.reason})`;
    }).join("\n");
  }
  if (/quente|fechar|pronto/.test(q)) {
    const hot = dossiers.filter((d) => d.intent === "quente" || d.temperature?.label === "quente" || d.temperature?.label === "negociacao");
    if (!hot.length) return "Nenhum lead com intenção quente ou em negociação no cadastro agora.";
    return hot.map((d) => {
      const c = db.contacts.find((x) => x.id === d.contactId);
      return `${c?.name}: ${d.nextAction.label}`;
    }).join("\n");
  }
  if (/esfria|parado|risco/.test(q)) {
    const rec = recoverOpportunities(db);
    if (!rec.length) return "Nenhuma oportunidade marcada para recuperação neste momento.";
    return rec.map((r) => `${r.name}: ${r.why} → ${r.action}`).join("\n");
  }
  if (/cota|lead.?dia|consumo/.test(q)) {
    const c = consumptionSnapshot(db);
    return `Leads hoje ${c.used}/${c.limit}. Diagnósticos hoje ${c.dxToday}. Execuções ${c.execToday}. ${c.note}`;
  }
  if (/como esta|briefing|minha empresa|situacao/.test(q)) {
    const h = commercialHealth(db);
    const c = consumptionSnapshot(db);
    const rec = recoverOpportunities(db);
    return `Cota ${c.used}/${c.limit}. Saúde: ${h.label}. ${h.detail} Recuperação: ${rec.length}. Missões no comando: ${(db.missions || []).filter((m) => m.status === "running" || m.status === "awaiting_approval").length}.`;
  }
  const hits = universalSearch(db, question);
  if (hits.length) return hits.map((h) => `${h.kind}: ${h.label}`).join("\n");
  return "Não achei isso no cadastro desta organização. Pergunte por pizzaria, proposta, quente, risco ou cota.";
}
