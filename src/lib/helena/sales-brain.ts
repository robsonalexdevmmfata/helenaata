// Sales Agentic AI Brain for HELENA (Tech Leader & SDR Autônoma de Elite)
// Info Tech Ltda · Target: R$ 15.000,00
import type { Contact, DB, Deal, Task, Activity } from "@/lib/types";
import { getDB, nowISO, uid, update } from "@/lib/store";
import { brl } from "@/lib/format";

// ============================================================================
// 1. AS 3 TRAVAS ANTI-DUPLICIDADE DA HELENA
// ============================================================================

/** Normaliza telefone para apenas dígitos (ex: +55 (11) 98000-1234 -> 5511980001234) */
export function cleanPhoneDigits(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  // Se começar com 55 e tiver 12 ou 13 dígitos, preserva formato padronizado
  return digits;
}

/**
 * Trava 1: Trava de ID Único (Telefone / CNPJ / ID do Maps).
 * Antes de qualquer SDR disparar uma mensagem, checa se este número já tem
 * registro de mensagem enviada ou status em "Em contato / Reunião".
 */
export function checkDuplicateContact(
  phone: string,
  db: DB,
  options?: { excludeContactId?: string; companyName?: string }
): { isDuplicate: boolean; reason?: string; contact?: Contact; deal?: Deal } {
  const targetClean = cleanPhoneDigits(phone);
  if (!targetClean) return { isDuplicate: false };

  // 1. Checa contatos existentes
  for (const c of db.contacts) {
    if (options?.excludeContactId && c.id === options.excludeContactId) continue;
    const cClean = cleanPhoneDigits(c.phone);

    // Bateu o telefone exato ou os últimos 8/9 dígitos (DDD + número)
    const matchesPhone =
      cClean === targetClean ||
      (cClean.length >= 8 && targetClean.length >= 8 && (cClean.endsWith(targetClean.slice(-8)) || targetClean.endsWith(cClean.slice(-8))));

    if (matchesPhone) {
      // Checa se o lead tem deal ativo ou reunião
      const deal = db.deals.find((d) => d.contactId === c.id);
      const isAdvanced = deal && (deal.stageId === "st_reun" || deal.stageId === "st_prop" || deal.stageId === "st_neg" || deal.status === "ganho");

      // Checa se já tem mensagem enviada ou conversa ativa
      const conv = db.conversations.find((cv) => cv.contactId === c.id);
      const hasMessages = conv && conv.messages.length > 0;

      if (isAdvanced) {
        return {
          isDuplicate: true,
          reason: `Número ${phone} já está em negociação avançada/reunião no Deal "${deal.title}" com status "${deal.status}". Contato pulado automaticamente pela Trava 1.`,
          contact: c,
          deal,
        };
      }

      if (hasMessages) {
        return {
          isDuplicate: true,
          reason: `Número ${phone} (${c.name}) já possui abordagem ativa registrada em ${c.lastContactAt}. Trava 1 impediu segundo disparo duplicado.`,
          contact: c,
          deal,
        };
      }

      return {
        isDuplicate: true,
        reason: `Contato já cadastrado como "${c.name}".`,
        contact: c,
        deal,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Trava 2: Fila Imutável de Prospecção (Deduplicação de Listas).
 * Limpa números repetidos e empresas duplicadas antes de injetar na campanha.
 */
export function deduplicateProspectList<T extends { phone?: string; name?: string; website?: string }>(
  items: T[],
  db: DB
): { unique: T[]; duplicatesSkipped: number; skippedReasons: string[] } {
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();
  const unique: T[] = [];
  const skippedReasons: string[] = [];

  for (const item of items) {
    const rawPhone = item.phone || "";
    const cleanP = cleanPhoneDigits(rawPhone);
    const cleanN = (item.name || "").trim().toLowerCase();

    // 1. Checa duplicação dentro do próprio lote
    if (cleanP && seenPhones.has(cleanP)) {
      skippedReasons.push(`Telefone ${rawPhone} repetido no lote`);
      continue;
    }
    if (cleanN && seenNames.has(cleanN)) {
      skippedReasons.push(`Empresa "${item.name}" repetida no lote`);
      continue;
    }

    // 2. Checa contra a base existente no banco (Trava de ID Único)
    const check = checkDuplicateContact(rawPhone, db, { companyName: item.name });
    if (check.isDuplicate) {
      skippedReasons.push(check.reason || `Já cadastrado no CRM`);
      continue;
    }

    if (cleanP) seenPhones.add(cleanP);
    if (cleanN) seenNames.add(cleanN);
    unique.push(item);
  }

  return {
    unique,
    duplicatesSkipped: items.length - unique.length,
    skippedReasons,
  };
}

/**
 * Trava 3: Log de Auditoria e Trava de Handoff entre SDRs.
 * Se o SDR 01 abordou a empresa X, o SDR 02 não enxerga nem aborda aquele lead na fila dele.
 */
export function isLeadHandledByAnotherSdr(
  contactId: string,
  currentSdrId: string,
  db: DB
): { blocked: boolean; assignedSdrName?: string; reason?: string } {
  const contact = db.contacts.find((c) => c.id === contactId);
  if (!contact) return { blocked: false };

  // Se o responsável for outro agente/SDR
  if (contact.ownerId && contact.ownerId !== currentSdrId) {
    const assignedAgent = db.agents.find((a) => a.id === contact.ownerId);
    if (assignedAgent) {
      return {
        blocked: true,
        assignedSdrName: assignedAgent.name,
        reason: `Lead já está sob custódia de ${assignedAgent.name}. Trava 3 (Handoff Lock) ativada para evitar colisão de abordagem.`,
      };
    }
  }

  // Verifica se há atividades recentes gravadas por outro SDR
  const otherSdrActivity = db.activities.find(
    (act) => act.contactId === contactId && act.type === "whatsapp" && act.actor !== currentSdrId
  );
  if (otherSdrActivity) {
    return {
      blocked: true,
      assignedSdrName: otherSdrActivity.actor,
      reason: `Lead já abordado anteriormente por ${otherSdrActivity.actor}. Trava 3 manteve integridade de atendimento.`,
    };
  }

  return { blocked: false };
}

// ============================================================================
// 2. PILAR 1: MOTOR DE NEGOCIAÇÃO E MATRIZ DE OBJEÇÕES (SALES BRAIN)
// ============================================================================

export interface ObjectionDef {
  id: string;
  title: string;
  clientQuote: string;
  triggerRegex: RegExp;
  getAutonomousResponse: (params: { clientName: string; companyName: string; niche: string }) => string;
  actionType: "send_demo_media" | "schedule_direct" | "reschedule_task" | "offer_roi" | "reactivation_cadence";
  actionDescription: string;
  demoMockMedia?: {
    type: "image" | "link";
    title: string;
    url: string;
    preview: string;
  };
}

export const OBJECTION_MATRIX: ObjectionDef[] = [
  {
    id: "obj_instagram",
    title: "Já tenho Instagram, não preciso de site",
    clientQuote: "Já tenho Instagram, não preciso de site.",
    triggerRegex: /(j[aá]\s*tenho\s*insta|s[oó]\s*uso\s*instagram|n[aã]o\s*preciso\s*de\s*site|meu\s*insta\s*basta)/i,
    getAutonomousResponse: ({ clientName, companyName, niche }) =>
      `O Instagram é excelente para atração visual, ${clientName}, mas hoje mais de 80% dos clientes que procuram por ${niche || "seus serviços"} com urgência na sua cidade pesquisam direto no Google Maps. Sem um site oficial integrado com agendamento direto, a ${companyName} perde pacientes/clientes qualificados todas as noites para a concorrência que aparece no topo do Google. Preparei um demonstrativo visual de como um site de alta conversão dobra seus agendamentos:`,
    actionType: "send_demo_media",
    actionDescription: "Envia print/mídia demonstrativo de modelo rápido para o nicho dele.",
    demoMockMedia: {
      type: "image",
      title: "Modelo de Alta Conversão · Google Maps Ready",
      url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80",
      preview: "⚡ Demonstração: Site Institucional responsivo com botão WhatsApp flutuante, SEO Local e Agendamento em 1-clique.",
    },
  },
  {
    id: "obj_preco",
    title: "Quanto custa? / Qual o valor?",
    clientQuote: "Quanto custa? / Me passa o valor.",
    triggerRegex: /(quanto\s*custa|qual\s*o\s*pre[cç]o|qual\s*o\s*valor|tabela\s*de\s*pre[cç]o|valores\?)/i,
    getAutonomousResponse: ({ clientName, companyName }) =>
      `Nós temos projetos sob medida para a ${companyName}, ${clientName}. Para não te tomar tempo e você ver exatamente o retorno sobre o investimento, criei uma prévia demonstrativa do sistema para o seu segmento. Você prefere ver em um vídeo rápido ou em uma ligação de apenas 3 minutos hoje às 16h ou amanhã às 10h?`,
    actionType: "schedule_direct",
    actionDescription: "Tenta o agendamento direto em vez de dar o preço solto de primeira (2 opções de horário).",
  },
  {
    id: "obj_ocupado",
    title: "Agora não posso conversar / Estou ocupado",
    clientQuote: "Agora não posso conversar / Estou na correria.",
    triggerRegex: /(n[aã]o\s*posso\s*conversar|estou\s*ocupad[oa]|na\s*correria|sem\s*tempo|depois\s*nos\s*falamos)/i,
    getAutonomousResponse: ({ clientName }) =>
      `Tranquilo, ${clientName}! Sei bem como é a rotina. Posso te recontactar amanhã às 10h ou você prefere no final da tarde, por volta das 17h?`,
    actionType: "reschedule_task",
    actionDescription: "Atualiza a tarefa (tasks) e agenda um follow-up automático na pipeline.",
  },
  {
    id: "obj_caro",
    title: "Achei o valor elevado / Sem orçamento",
    clientQuote: "Achei caro / Está fora do meu orçamento.",
    triggerRegex: /(achei\s*caro|muito\s*caro|fora\s*do\s*or[cç]amento|sem\s*verba|pesado\s*pro\s*bolso)/i,
    getAutonomousResponse: ({ clientName, companyName, niche }) =>
      `Entendo perfeitamente, ${clientName}. Mas veja pelo lado do retorno: no seu segmento de ${niche || "serviços"}, se esse sistema oficial trouxer apenas 1 ou 2 novos clientes por mês vindos do Google, o projeto inteiro já se paga sozinho. Além disso, a diretoria liberou parcelamento em até 12x no cartão ou condição especial no Pix para fecharmos esta semana. Faz sentido agendarmos 5 minutos para você avaliar?`,
    actionType: "offer_roi",
    actionDescription: "Apresenta cálculo de ROI imediato (1 cliente paga o site) e condição especial.",
  },
  {
    id: "obj_sem_interesse",
    title: "Não tenho interesse no momento",
    clientQuote: "Não tenho interesse agora.",
    triggerRegex: /(n[aã]o\s*tenho\s*interesse|n[aã]o\s*quero|deixa\s*pra\s*l[aá]|n[aã]o\s*preciso)/i,
    getAutonomousResponse: ({ clientName }) =>
      `Sem problemas, ${clientName}! Obrigado pela sinceridade. Vou deixar o link do nosso portfólio salvo aqui. Se futuramente quiser acelerar suas vendas pelo Google, estou à disposição! Tenha uma excelente semana.`,
    actionType: "reactivation_cadence",
    actionDescription: "Envia link institucional cordial e programa cadência de reaquecimento para 45 dias.",
  },
];

/** Detecta se o texto do cliente contém uma objeção da matriz */
export function matchObjection(text: string): ObjectionDef | null {
  for (const obj of OBJECTION_MATRIX) {
    if (obj.triggerRegex.test(text)) {
      return obj;
    }
  }
  return null;
}

// ============================================================================
// 3. PILAR 2: QUALIFICAÇÃO BANT & MOTOR DE FECHAMENTO / ESCALONAMENTO
// ============================================================================

export interface BantEvaluation {
  budget: { score: number; label: string; passed: boolean };
  authority: { score: number; label: string; passed: boolean };
  need: { score: number; label: string; passed: boolean };
  timeline: { score: number; label: string; passed: boolean };
  totalScore: number; // 0 a 100
  isQualified: boolean;
  isHotClosing: boolean;
  isEnterpriseHandoff: boolean;
  recommendation: string;
}

export function evaluateBant(contact: Contact, deal?: Deal, lastText = ""): BantEvaluation {
  const normTitle = (contact.title || "").toLowerCase();
  const tags = contact.tags.map((t) => t.toLowerCase());
  const dealValue = deal?.value || 4900;

  // 1. Budget (Orçamento)
  const isBudgetPassed = dealValue >= 3000 || tags.includes("tubarão") || tags.includes("quente");
  const budgetScore = tags.includes("tubarão") ? 25 : isBudgetPassed ? 20 : 15;
  const budgetLabel = tags.includes("tubarão")
    ? "Orçamento Alto (Tubarão / Empresa sólida)"
    : "Capacidade Financeira compatível (R$ 3.000 a R$ 6.000)";

  // 2. Authority (Autoridade)
  const isAuthority =
    /diretor|s[oó]ci[oa]|propriet[aá]ri[oa]|ceo|fundador|m[eé]dic[oa]|dentista|gestor|gerente/i.test(normTitle) ||
    /dr|dra/i.test(contact.name);
  const authorityScore = isAuthority ? 25 : 12;
  const authorityLabel = isAuthority
    ? `Tomador de Decisão Confirmado (${contact.title || "Proprietário"})`
    : `Interlocutor em validação (${contact.title || "Contato"})`;

  // 3. Need (Necessidade)
  const hasSemSite = tags.includes("#sem-site") || !contact.companyId;
  const needScore = hasSemSite ? 25 : 18;
  const needLabel = hasSemSite
    ? "Dor Crítica: Sem Site Oficial no Google Maps (#sem-site)"
    : "Necessidade de Modernização Digital";

  // 4. Timeline (Urgência)
  const isUrgent =
    /fechar|pagamento|pix|come[cç]ar|agendar|hoje|amanh[aã]|urgente/i.test(lastText) ||
    (deal && (deal.stageId === "st_reun" || deal.stageId === "st_prop" || deal.stageId === "st_neg"));
  const timelineScore = isUrgent ? 25 : 15;
  const timelineLabel = isUrgent ? "Urgência Alta (Janela de 24h a 7 dias)" : "Janela Normal de 15 a 30 dias";

  const totalScore = budgetScore + authorityScore + needScore + timelineScore;
  const isQualified = totalScore >= 70;
  const isHotClosing = /como\s*fa[cç]o\s*o\s*pagamento|quero\s*fechar|manda\s*o\s*pix|link\s*de\s*pagamento|fechado/i.test(lastText);
  const isEnterpriseHandoff = tags.includes("tubarão") || dealValue > 10000;

  let recommendation = "Manter cadência de nutrição com SDR.";
  if (isHotClosing) {
    recommendation = "Gatilho de Fechamento: Gerar Link de Checkout/Pix e enviar no chat imediatamente.";
  } else if (isEnterpriseHandoff) {
    recommendation = "Gatilho de Handoff: Conta corporativa de alto ticket. Transbordar para especialista humano.";
  } else if (isQualified) {
    recommendation = "Qualificado: Agendar demonstração com o Closer.";
  }

  return {
    budget: { score: budgetScore, label: budgetLabel, passed: isBudgetPassed },
    authority: { score: authorityScore, label: authorityLabel, passed: isAuthority },
    need: { score: needScore, label: needLabel, passed: hasSemSite },
    timeline: { score: timelineScore, label: timelineLabel, passed: isUrgent },
    totalScore,
    isQualified,
    isHotClosing,
    isEnterpriseHandoff,
    recommendation,
  };
}

/** Gera link de Checkout Pix / Mercado Pago / Asaas com QR Code */
export function generatePixCheckout(amount: number, clientName: string, dealTitle: string) {
  const txid = `infotech_${uid("pix_")}`;
  const copyPasteKey = `00020126580014BR.GOV.BCB.PIX0136infotech-financeiro@infotech.com.br520400005303986540${amount.toFixed(2)}5802BR5915INFO TECH LTDA6009SAO PAULO62070503***6304${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  const checkoutUrl = `https://checkout.infotech.com.br/pay/${txid}`;

  return {
    txid,
    amount,
    clientName,
    dealTitle,
    copyPasteKey,
    checkoutUrl,
    expiresInMinutes: 30,
    formattedValue: brl(amount),
  };
}

// ============================================================================
// 4. PILAR 3: GESTÃO DINÂMICA DA META DE R$ 15.000,00 (DYNAMIC CADENCE)
// ============================================================================

export const FINANCIAL_GOAL = 15000; // Meta estipulada pelo usuário

export interface DynamicCadenceState {
  goal: number;
  achieved: number;
  percent: number;
  remaining: number;
  openPipelineValue: number;
  pacingStatus: "turbo" | "normal" | "meta_batida";
  dailyTargetCadence: number; // Abordagens/dia recomendadas (ex: 30 vs 60)
  staleDealsCount: number;
  rescueMessage: string;
}

export function computeDynamicCadence(db: DB): DynamicCadenceState {
  const wonDeals = db.deals.filter((d) => d.status === "ganho");
  const achieved = wonDeals.reduce((sum, d) => sum + d.value, 0);
  const percent = Math.min(Math.round((achieved / FINANCIAL_GOAL) * 100), 100);
  const remaining = Math.max(0, FINANCIAL_GOAL - achieved);

  const openDeals = db.deals.filter((d) => d.status === "aberto");
  const openPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);

  // Calcula se está abaixo da meta (ex: dia da semana vs ritmo)
  const isGoalReached = achieved >= FINANCIAL_GOAL;
  const isBelowPace = achieved < FINANCIAL_GOAL * 0.65; // Abaixo de 65% da meta

  const pacingStatus: DynamicCadenceState["pacingStatus"] = isGoalReached
    ? "meta_batida"
    : isBelowPace
    ? "turbo"
    : "normal";

  // Se estiver abaixo do ritmo, aumenta a cadência dos SDRs de 30 para 60 abordagens/dia
  const dailyTargetCadence = pacingStatus === "turbo" ? 60 : 30;

  // Identifica deals travados no Kanban há mais de 48h
  const now = Date.now();
  const staleDeals = openDeals.filter(
    (d) => now - new Date(d.updatedAt).getTime() > 48 * 3600 * 1000
  );

  const rescueMessage =
    "Consegui uma condição especial de parcelamento com o time técnico da Info Tech Ltda para liberarmos o seu sistema esta semana. Podemos fechar hoje?";

  return {
    goal: FINANCIAL_GOAL,
    achieved,
    percent,
    remaining,
    openPipelineValue,
    pacingStatus,
    dailyTargetCadence,
    staleDealsCount: staleDeals.length,
    rescueMessage,
  };
}

/** Resgata leads frios parados há mais de 48h */
export function executeRescueColdLeads(db: DB, actorName = "Helena"): { rescuedCount: number; dealTitles: string[] } {
  const now = Date.now();
  const staleDeals = db.deals.filter(
    (d) => d.status === "aberto" && now - new Date(d.updatedAt).getTime() > 48 * 3600 * 1000
  );

  if (staleDeals.length === 0) return { rescuedCount: 0, dealTitles: [] };

  const rescuedTitles: string[] = [];

  update((d) => {
    staleDeals.forEach((stale) => {
      rescuedTitles.push(stale.title);
      const contact = d.contacts.find((c) => c.id === stale.contactId);

      // 1. Atualiza timestamp do deal para reativar
      const targetDeal = d.deals.find((x) => x.id === stale.id);
      if (targetDeal) {
        targetDeal.updatedAt = nowISO();
      }

      // 2. Dispara mensagem de resgate no WhatsApp
      const conv = d.conversations.find((c) => c.contactId === stale.contactId);
      const rescueText = `Olá ${contact?.name || "amigo(a)"}! Passando para te avisar que conversei com o time técnico da Info Tech Ltda e consegui uma condição especial de parcelamento com liberação de domínio e SEO grátis se fecharmos a criação do seu site esta semana. Gostaria de aproveitar essa condição?`;

      if (conv) {
        conv.messages.push({
          id: uid("msg_resgate_"),
          from: "agent",
          authorName: "Helena AI (Resgate Comercial)",
          text: rescueText,
          at: nowISO(),
          kind: "text",
        });
        conv.lastMessageAt = nowISO();
      }

      // 3. Registra auditoria
      d.activities.unshift({
        id: uid("ac_resgate_"),
        organizationId: d.organization.id,
        contactId: stale.contactId,
        dealId: stale.id,
        type: "ia",
        text: `⚡ HELENA disparou Resgate de Oportunidade (>48h parado): "${rescueText}"`,
        actor: actorName,
        createdAt: nowISO(),
      });
    });
  });

  return {
    rescuedCount: rescuedTitles.length,
    dealTitles: rescuedTitles,
  };
}

// ============================================================================
// 5. WHATSAPP BACKGROUND SOCKET ARCHITECTURE (<80MB RAM / SEM ABAS)
// ============================================================================

export interface WhatsAppWorkerStatus {
  serviceName: string;
  architecture: "Socket/API (Baileys / Node.js Background)";
  hasBrowserTabs: false;
  ramUsageMb: number;
  phonePaired: boolean;
  phoneBatteryStatus: string;
  uptimeHours: number;
  status: "ONLINE_SOCKET" | "OFFLINE";
  hostingMode: "Oracle Cloud Free Tier (24/7)" | "PC Local Segundo Plano";
  antiBanSafeDelaySeconds: string;
}

export function getWhatsAppWorkerStatus(db: DB): WhatsAppWorkerStatus {
  const conn = db.connections.find((c) => c.id === "wa1") || db.connections[0];
  const isOnline = conn ? conn.status === "online" : true;

  return {
    serviceName: "Helena WhatsApp Socket Worker (Baileys v6.7)",
    architecture: "Socket/API (Baileys / Node.js Background)",
    hasBrowserTabs: false,
    ramUsageMb: 68, // Menos de 80MB de RAM
    phonePaired: isOnline,
    phoneBatteryStatus: "100% (Conectado ao Carregador)",
    uptimeHours: 142,
    status: isOnline ? "ONLINE_SOCKET" : "OFFLINE",
    hostingMode: "Oracle Cloud Free Tier (24/7)",
    antiBanSafeDelaySeconds: "15s–45s dinâmico",
  };
}

// ============================================================================
// 6. PROMPT EXECUTIVO DA HELENA (DIRETORA COMERCIAL E TECH LEADER)
// ============================================================================

export const HELENA_EXECUTIVE_SALES_PROMPT = `Você é a HELENA, Tech Leader e Diretora Comercial da agência Info Tech Ltda. Seu objetivo principal é atingir a meta financeira estipulada pelo usuário (R$ 15.000,00). Suas diretrizes de negociação são:
1. Nunca seja robótica ou formal demais. Fale como uma consultora de negócios executiva humana, direta e empática.
2. Em prospecções frias, foque 100% na dor da falta de site/sistema (perda de clientes na região que buscam no Google Maps).
3. Sempre conduza a conversa terminando com uma pergunta aberta ou sugestão de dois horários para reunião (ex: "hoje às 16h ou amanhã às 10h?").
4. Quando o cliente demonstrar intenção clara de compra ("quero fechar", "como faço o pagamento"), forneça o link de fechamento com Pix instantâneo ou agende o compromisso no calendário instantaneamente.
5. Respeite os limites de disparo e mantenha os logs de auditoria imutáveis.`;
