import type { ServiceOffer } from "@/lib/types";
import { clientAskedPrice, quoteEntryPrices } from "@/lib/catalog";
import { matchObjection } from "@/lib/helena/sales-brain";
import { previewUrl } from "@/lib/dev/presence";
import { getDB } from "@/lib/store";

/**
 * Time Comercial lê a conversa e responde naturalmente:
 * 1) confirma se é dono/responsável
 * 2) se sim → negociação: tem IA operando na empresa?
 * 3) depois → site/cardápio + link + caminho de fechamento
 */

export type ChatTurn = { from: string; text: string };

export type InboxPreviewCtx = {
  url?: string;
  withMenu?: boolean;
  companyName?: string;
};

function n(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const WRONG_NUMBER =
  /somente para vendas|so (pra|para) venda|contato acima|numero errado|whatsapp (errado|so (de|pra|para))|nao sou (o|a) respons|esse (numero|whatsapp) (e|eh) (de|so)/i;

export const NOT_OWNER =
  /nao sou (o |a )?(dono|dona|propriet|socio)|sou (funcionari|atendent|secretari|vendedor)|trabalho aqui|nao e comigo|nao decido/i;

/**
 * “vou passar pro responsável / dono / gerente”, “mando pro proprietário”, etc.
 * Time acompanha o Inbox e marca follow-up — não encerra a conversa.
 */
export const WILL_PASS_TO_OWNER =
  /(vou|ja|já|posso|vou te|vou (lhe|te)?\s*)?(passar|encaminhar|mandar|avisar|mostrar|falar)\b.{0,40}\b(pro|para o|para a|ao|à|pro|pro\/a)?\s*(dono|dona|propriet|socio|gerente|responsavel|responsável|representante)|quando (o |a )?(dono|dona|responsavel|responsável|gerente|propriet).{0,20}(ver|olhar|chegar|voltar)|ele(a)? (que )?(decide|e o dono|é o dono)|depois (o |a )?(dono|responsavel|responsável)/i;

/** “sou proprietario sim”, “sim sou o dono”, “sou a responsável”, etc. */
export const IS_OWNER =
  /\b(sou|sim)\b.*\b(o |a )?(dono|dona|proprietari[oa]|socio|socia|responsavel|responsável)\b|\b(dono|dona|proprietari[oa]|responsavel|responsável)\b.*\b(sim|sou)\b|^(sou |sim[,.]?\s*)(o |a )?(dono|dona|proprietari[oa]|socio|socia|responsavel)\b|eu (que )?(dono|decido|sou o dono|sou a dona|responsavel)/i;

export const HAS_AI =
  /\b(sim|temos|ja temos|já temos|uso|usamos|tem ia|inteligencia|inteligência|chatgpt|bot|automacao|automação)\b/i;

export const NO_AI =
  /\b(nao|não|ainda nao|ainda não|nenhuma|zero|manual|tudo na mao|tudo na mão|nao temos|não temos)\b/i;

function isAudioTurn(text: string) {
  return /\[Áudio\]/i.test(text);
}

export function askedIfOwner(history: ChatTurn[]) {
  return history.some(
    (m) =>
      m.from !== "contact" &&
      /proprietari[oa]|dono ou a dona|dono\(a\)|do estabelecimento|respons[aá]vel|pessoa respons[aá]vel|voc[eê] [eé] a respons/i.test(m.text),
  );
}

/** Time já abriu a negociação de IA / pitch padrão (advocacia ou geral). */
export function askedAboutAi(history: ChatTurn[]) {
  return history.some(
    (m) =>
      m.from !== "contact" &&
      /intelig[eê]ncia artificial|IA operando|tem ia|bot no (atendimento|whatsapp)|automa[cç][aã]o (de |no )?atendimento|agente de ia para atendimento|assistente virtual que atende|duas solu[cç][oõ]es que podem ajudar/i.test(
        m.text,
      ),
  );
}

/** Contato já disse que é dono (nas mensagens). */
export function contactConfirmedOwner(history: ChatTurn[]) {
  return history.some((m) => m.from === "contact" && IS_OWNER.test(m.text.replace(/^\[Áudio\]\s*/i, "")));
}

export function agentPitchCount(history: ChatTurn[]) {
  return history.filter(
    (m) => m.from !== "contact" && (/site|landing|google|10 minutos|reuniao|reunião|cardápio|cardapio/i.test(m.text) || /https?:\/\/\S*\/v\//i.test(m.text)),
  ).length;
}

function alreadySentPreviewLink(history: ChatTurn[]) {
  return history.some((m) => m.from !== "contact" && /https?:\/\/\S*\/v\//i.test(m.text));
}

function firstNameOf(firstName: string) {
  return firstName.replace(/^(dra?\.)\s*/i, "").split(/\s+/)[0] || "";
}

function honorific(firstName: string, niche: string) {
  const raw = String(firstName || "").trim();
  if (/^dra?\./i.test(raw)) return raw.split(/\s+/)[0];
  if (/advog|jurid|escrit/i.test(niche)) {
    const base = firstNameOf(firstName) || "Doutor";
    // Se o nome já veio sem título, usa Doutor(a) de forma neutra.
    if (/a$/i.test(base) && !/^(joao|joão|lucas|pedro|carlos|andre|andré|rafael|bruno)/i.test(base)) {
      return `Doutora ${base}`;
    }
    return `Doutor ${base}`;
  }
  return firstNameOf(firstName);
}

/**
 * Abordagem padrão Info Tech quando o ADVogado confirma que é proprietário.
 * Site profissional + Agente de IA no WhatsApp + pedido de demonstração.
 */
export function lawyerOwnerPitch(contactName: string, companyName?: string) {
  const title = honorific(contactName, "advogados");
  const office = companyName?.trim() ? ` do ${companyName.trim()}` : " do seu escritório";
  return `Perfeito, ${title}! Obrigado pelo retorno.

Meu nome é Robson Alex, sou da Info Tech. Dei uma olhada na presença digital${office} e percebi uma oportunidade interessante para fortalecer ainda mais sua imagem profissional na internet.

Trabalhamos com duas soluções que podem ajudar bastante seu escritório:

1. Site profissional para advocacia:
Um site próprio, apresentando sua atuação, áreas jurídicas, informações do escritório e canais de contato. Assim, quando alguém encontrar seu escritório pelo Google, terá um espaço profissional para conhecer seu trabalho e entrar em contato.

2. Agente de IA para atendimento pelo WhatsApp:
Uma assistente virtual que atende automaticamente, 24 horas por dia, responde dúvidas institucionais, identifica o que o potencial cliente procura, coleta informações iniciais e encaminha o contato para você ou sua equipe. Tudo com atendimento organizado e sem deixar mensagens sem resposta.

A ideia é ajudar seu escritório a transmitir mais credibilidade, aproveitar melhor os contatos que chegam pela internet e reduzir o tempo gasto com atendimentos repetitivos.

${title}, posso lhe mostrar uma demonstração de como ficaria um site para seu escritório e como funcionaria essa assistente de IA no WhatsApp?`;
}

/** Abre a negociação depois que o lead confirma que é dono (nicho geral). */
export function askAboutAiOps(firstName: string, companyName?: string, niche = "") {
  if (/advog|jurid|escrit/i.test(niche)) {
    return lawyerOwnerPitch(firstName, companyName);
  }
  const name = firstNameOf(firstName);
  const hi = name ? `${name}, ` : "";
  const co = companyName ? ` na ${companyName}` : " na empresa";
  return `${hi}perfeito — então falo com quem decide. Só pra eu te atender certo: hoje tem alguma inteligência artificial operando${co} (atendimento, WhatsApp, processos), ou ainda é tudo manual?`;
}

function offerSiteAndLink(firstName: string, niche: string, preview?: InboxPreviewCtx, aiHint?: "has" | "none" | "unknown") {
  const name = firstNameOf(firstName);
  const hi = name ? `${name}, ` : "";
  const law = /advog|jurid|escrit/i.test(niche);
  const company = preview?.companyName || "vocês";
  const url = String(preview?.url || "").trim();
  const withMenu = Boolean(preview?.withMenu);
  const product = withMenu
    ? "um cardápio digital com pedidos no WhatsApp"
    : law
      ? "um site profissional do escritório com WhatsApp em 1 toque"
      : "um site profissional com WhatsApp em 1 toque";

  const bridge =
    aiHint === "has"
      ? "Beleza — então vocês já mexem com IA. Dá pra encaixar site/cardápio + WhatsApp no mesmo fluxo, sem bagunça."
      : aiHint === "none"
        ? "Tranquilo — a maioria ainda está 100% manual. A gente sobe presença digital e o WhatsApp passa a trabalhar sozinho."
        : "Beleza. Independentemente disso, o próximo passo é presença própria no ar.";

  if (url) {
    return `${hi}${bridge}

Montei ${product} pra ${company} — já no ar. Abre o link (é clicável):

${url}

Se fizer sentido, publicamos oficial e alinhamos o WhatsApp com IA (ou semi-automático) do jeito que você quiser. Topa 10 minutos pra eu te mostrar?`;
  }

  return `${hi}${bridge} Topa 10 minutos pra eu te mostrar o caminho (site${withMenu ? " + cardápio" : ""} + WhatsApp), sem compromisso?`;
}

export function nextInboxReply(
  clientText: string,
  history: ChatTurn[],
  firstName: string,
  offers: ServiceOffer[] = [],
  niche = "",
  preview?: InboxPreviewCtx,
): string | null {
  const spoken = clientText.replace(/^\[Áudio\]\s*/i, "");
  const msg = n(spoken);
  const name = firstNameOf(firstName);
  const hi = name ? `${name}, ` : "";
  const law = /advog|jurid|escrit/i.test(niche);
  const nicheLabel = law ? "advogado" : niche || "seu serviço";
  const audio = isAudioTurn(clientText);
  const company = preview?.companyName;

  if (WRONG_NUMBER.test(spoken) || /nao tenho interesse|pode parar|nao me envie|stop/i.test(spoken)) {
    return "Combinado, desculpa o incômodo. Não mando mais neste número. Se puder, me passa o WhatsApp do(a) proprietário(a) que eu falo direto com ele(a).";
  }

  // Funcionário vai passar pro dono/responsável → mantém conversa + follow-up depois.
  if (WILL_PASS_TO_OWNER.test(spoken) || WILL_PASS_TO_OWNER.test(msg)) {
    return `${hi}perfeito, obrigado. Quando o(a) responsável puder olhar, me responde por aqui — ou me passa o WhatsApp dele(a) que eu falo direto, sem te atrapalhar. Fico no aguardo.`;
  }

  if (askedIfOwner(history) && (NOT_OWNER.test(spoken) || (/^(nao|naum|n)\b/.test(msg) && !IS_OWNER.test(spoken) && !audio))) {
    return "Sem problema. Pode me passar o WhatsApp do proprietário ou da proprietária? Assim eu não te incomodo mais.";
  }

  if (clientAskedPrice(spoken)) {
    const quote = quoteEntryPrices(offers);
    if (!askedIfOwner(history) && !contactConfirmedOwner(history)) {
      return `${quote} Antes: você é o proprietário, a proprietária ou a pessoa responsável?`;
    }
    if (!askedAboutAi(history)) {
      return `${quote}\n\n${askAboutAiOps(firstName, company, niche)}`;
    }
    if (!alreadySentPreviewLink(history) && preview?.url) {
      return `${quote}

Enquanto isso, olha a prévia no ar:

${preview.url}

Em 10 minutos te mostro o que sobe oficial.`;
    }
    return `${quote} Se quiser, em 10 minutos te mostro o que sobe no ar e como o WhatsApp passa a trabalhar por você.`;
  }

  const objection = matchObjection(spoken);
  if (objection && objection.id !== "obj_preco" && objection.id !== "obj_sem_interesse") {
    return objection.getAutonomousResponse({
      clientName: name || (law ? "Dra." : "oi"),
      companyName: company || "vocês",
      niche: nicheLabel,
    });
  }

  // Soft close: já pitchou e o lead só agradeceu.
  if (/obrigad|ok\b|blz|beleza|combinado|ta bom|tá bom/.test(msg) && agentPitchCount(history) >= 1 && askedAboutAi(history)) {
    return null;
  }

  // ── Etapa 1: ainda não sabemos se é dono ──────────────────────────────────
  if (!askedIfOwner(history) && !contactConfirmedOwner([...history, { from: "contact", text: clientText }])) {
    if (IS_OWNER.test(spoken) || /^(sim|sou|eu mesmo|eu mesma)\b/.test(msg)) {
      return askAboutAiOps(firstName, company, niche);
    }
    return law
      ? `${hi}obrigado pelo ${audio ? "áudio" : "retorno"}. Só pra não te tomar tempo: você é a responsável pelo escritório?`
      : `${hi}obrigado pelo ${audio ? "áudio" : "retorno"}. Só para não te tomar tempo à toa: você é o proprietário, a proprietária ou a pessoa responsável?`;
  }

  // ── Etapa 2: dono confirmou → pitch padrão (advogado) ou pergunta de IA ───
  const ownerNow = IS_OWNER.test(spoken) || /^(sim|sou|eu mesmo|eu mesma|certo|isso)\b/.test(msg);
  const ownerKnown = contactConfirmedOwner(history) || ownerNow || (askedIfOwner(history) && (audio || ownerNow));

  if (ownerKnown && !askedAboutAi(history)) {
    if (ownerNow || audio || (askedIfOwner(history) && msg.length > 0 && !NOT_OWNER.test(spoken))) {
      return askAboutAiOps(firstName, company, niche);
    }
  }

  // ── Etapa 3: após pitch/IA → demo, link ou fechamento natural ─────────────
  if (askedAboutAi(history) && !alreadySentPreviewLink(history) && agentPitchCount(history) < 3) {
    // Advocacia: se pediu demo / topou ver → manda link da prévia (se houver)
    if (law && /sim|pode|quero|bora|vamos|mostrar|ver|demonstra|claro|ok|blz/i.test(msg) && preview?.url) {
      return `${honorific(firstName, niche)}, perfeito. Preparei a demonstração do site do escritório — abre o link (é clicável):

${preview.url}

Enquanto isso, a assistente de IA no WhatsApp atende 24h, organiza o lead e te encaminha o que importa. Prefere que eu te mostre o fluxo em 10 minutos hoje à tarde ou amanhã de manhã?`;
    }
    if (law) {
      // Não repete o pitch longo; só empurra a demo
      if (/sim|pode|quero|bora|vamos|mostrar|ver|demonstra|claro|ok|blz/i.test(msg)) {
        return `${honorific(firstName, niche)}, fechado. Me diz um horário de 10 minutos (hoje à tarde ou amanhã de manhã) que eu te mostro o site e a assistente de IA no WhatsApp.`;
      }
      return null;
    }
    const aiHint: "has" | "none" | "unknown" = HAS_AI.test(spoken) && !NO_AI.test(spoken)
      ? "has"
      : NO_AI.test(spoken)
        ? "none"
        : "unknown";
    if (msg.length > 0 || audio) {
      return offerSiteAndLink(firstName, niche, preview, aiHint);
    }
  }

  // Dono confirmou mas ainda sem link e já falou de IA → reforça oferta se ainda não pitchou
  if (askedAboutAi(history) && alreadySentPreviewLink(history) && /sim|pode|quero|bora|vamos|mostrar|ver/i.test(msg)) {
    return `${hi}fechado. Me diz um horário de 10 min que funciona pra você (hoje à tarde ou amanhã de manhã) que eu encaixo.`;
  }

  if (agentPitchCount(history) >= 2 && askedAboutAi(history)) return null;

  return null;
}

/** Resolve URL pública da prévia do lead (aprovada/enviada preferencial). */
export function previewCtxForContact(contactId: string, companyName?: string): InboxPreviewCtx | undefined {
  const db = getDB();
  const rows = (db.sitePreviews || []).filter((p) => p.contactId === contactId);
  const row =
    rows.find((p) => p.status === "aprovada" || p.status === "enviada" || p.status === "aprovada_cliente")
    || rows.find((p) => p.status === "pronta")
    || rows[0];
  if (!row) return undefined;
  return {
    url: row.vercelUrl || previewUrl(row.slug),
    withMenu: Boolean(row.menu?.length),
    companyName: companyName || row.name,
  };
}

/**
 * Follow-up pós-visualização: lê as últimas mensagens e monta texto natural.
 * Só deve ser usado quando o lead VIU (✓✓ azul) e não respondeu.
 */
export function buildReadFollowupText(opts: {
  contactName: string;
  agentName: string;
  company: string;
  history: ChatTurn[];
  previewUrl?: string;
}) {
  const first = firstNameOf(opts.contactName) || opts.contactName.split(/\s+/)[0] || "";
  const hi = first ? `${first}, ` : "";
  const ownerAsked = askedIfOwner(opts.history);
  const aiAsked = askedAboutAi(opts.history);
  const ownerYes = contactConfirmedOwner(opts.history);

  if (ownerYes && !aiAsked) {
    // Follow-up pós-visualização: se já confirmou dono, manda o pitch (advocacia usa o padrão completo).
    return askAboutAiOps(opts.contactName, opts.company, /escrit|advog|jurid/i.test(opts.company) ? "advogados" : "");
  }
  const waitingOwner = opts.history.some(
    (m) => m.from === "contact" && WILL_PASS_TO_OWNER.test(m.text.replace(/^\[Áudio\]\s*/i, "")),
  );
  if (waitingOwner && !ownerYes) {
    return `${hi}aqui é ${opts.agentName} de novo. Conseguiu falar com o(a) responsável? Se preferir, me passa o WhatsApp dele(a) que eu explico em 2 minutos.`;
  }
  if (ownerAsked && !ownerYes && !aiAsked) {
    return `${hi}aqui é ${opts.agentName} de novo. Só confirmo: você é o proprietário, a proprietária ou a pessoa responsável? Se for, te pergunto uma coisa rápida sobre IA na operação.`;
  }
  if (aiAsked && opts.previewUrl) {
    return `${hi}vi que você abriu a conversa. Deixei a prévia pronta — dá uma olhada quando puder:

${opts.previewUrl}

Se fizer sentido, a gente publica e alinhamos o WhatsApp. Topa 10 minutos?`;
  }
  if (opts.previewUrl) {
    return `${hi}vi que você visualizou. Se quiser, abre a prévia que montei:

${opts.previewUrl}

Qualquer dúvida, me responde por aqui.`;
  }
  return `${hi}vi que você visualizou a mensagem. Continuo por aqui se quiser — é só responder. Você é o proprietário ou a pessoa responsável?`;
}
