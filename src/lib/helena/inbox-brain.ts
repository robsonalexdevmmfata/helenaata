import type { ServiceOffer } from "@/lib/types";
import { clientAskedPrice, quoteEntryPrices } from "@/lib/catalog";
import { matchObjection } from "@/lib/helena/sales-brain";

/** Regras da conversa no Inbox: pouco volume, pergunta se é dono(a), não repete pitch. */

export type ChatTurn = { from: string; text: string };

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

export const IS_OWNER =
  /^(sou |sim[,.]? )?(o |a )?(dono|dona|proprietari[oa]|socio|socia)\b|\bsim\b.*\b(dono|dona|propriet)|eu (que )?(dono|decido|sou o dono|sou a dona)/i;

export function askedIfOwner(history: ChatTurn[]) {
  return history.some((m) => m.from !== "contact" && /proprietari[oa]|dono ou a dona|dono\(a\)|do estabelecimento/i.test(m.text));
}

export function agentPitchCount(history: ChatTurn[]) {
  return history.filter(
    (m) => m.from !== "contact" && /site|landing|google|10 minutos|reuniao|reunião/i.test(m.text),
  ).length;
}

export function nextInboxReply(clientText: string, history: ChatTurn[], firstName: string, offers: ServiceOffer[] = []): string | null {
  const msg = n(clientText);
  const name = firstName.replace(/^(dra?\.)\s*/i, "").split(/\s+/)[0] || "";
  const hi = name ? `${name}, ` : "";

  if (WRONG_NUMBER.test(clientText) || /nao tenho interesse|pode parar|nao me envie|stop/i.test(clientText)) {
    return "Combinado, desculpa o incômodo. Não mando mais neste número. Se puder, me passa o WhatsApp do(a) proprietário(a) que eu falo direto com ele(a).";
  }

  if (askedIfOwner(history) && (NOT_OWNER.test(clientText) || /^(nao|naum|n)\b/.test(msg))) {
    return "Sem problema. Pode me passar o WhatsApp do proprietário ou da proprietária? Assim eu não te incomodo mais.";
  }

  if (clientAskedPrice(clientText)) {
    const quote = quoteEntryPrices(offers);
    if (!askedIfOwner(history)) {
      return `${quote} Antes: você é o proprietário ou a proprietária do estabelecimento?`;
    }
    return quote;
  }

  const objection = matchObjection(clientText);
  if (objection && objection.id !== "obj_preco" && objection.id !== "obj_sem_interesse") {
    return objection.getAutonomousResponse({ clientName: name || "oi", companyName: "vocês", niche: "seu serviço" });
  }

  if (!askedIfOwner(history)) {
    if (IS_OWNER.test(clientText) || /^(sim|sou|eu mesmo|eu mesma)\b/.test(msg)) {
      return `${hi}perfeito. Antes de qualquer proposta: você que decide site e divulgação da empresa, certo? Se sim, me diz só se hoje o movimento vem mais de indicação, Instagram ou gente que te busca no Google.`;
    }
    return `${hi}obrigado pelo retorno. Só para não te tomar tempo à toa: você é o proprietário ou a proprietária do estabelecimento?`;
  }

  if (IS_OWNER.test(clientText) || /^(sim|sou|eu mesmo|eu mesma|certo|isso)\b/.test(msg)) {
    return "Show. Sem enrolação: vocês ainda não aparecem bem quando alguém busca o serviço na região. Topa 10 minutos só para eu te mostrar o caminho, sem compromisso? Pode ser um horário que você escolher.";
  }

  if (/obrigad|ok\b|blz|beleza|combinado|ta bom|tá bom/.test(msg) && agentPitchCount(history) >= 1) {
    return null;
  }

  if (agentPitchCount(history) >= 2) return null;

  return null;
}
