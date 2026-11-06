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
  return history.some(
    (m) =>
      m.from !== "contact" &&
      /proprietari[oa]|dono ou a dona|dono\(a\)|do estabelecimento|respons[aá]vel pelo escrit[oó]rio|voc[eê] [eé] a respons/i.test(m.text),
  );
}

export function agentPitchCount(history: ChatTurn[]) {
  return history.filter(
    (m) => m.from !== "contact" && /site|landing|google|10 minutos|reuniao|reunião/i.test(m.text),
  ).length;
}

export function nextInboxReply(
  clientText: string,
  history: ChatTurn[],
  firstName: string,
  offers: ServiceOffer[] = [],
  niche = "",
): string | null {
  const spoken = clientText.replace(/^\[Áudio\]\s*/i, "");
  const msg = n(spoken);
  const name = firstName.replace(/^(dra?\.)\s*/i, "").split(/\s+/)[0] || "";
  const hi = name ? `${name}, ` : "";
  const law = /advog|jurid|escrit/i.test(niche);
  const nicheLabel = law ? "advogado" : niche || "seu serviço";

  if (WRONG_NUMBER.test(spoken) || /nao tenho interesse|pode parar|nao me envie|stop/i.test(spoken)) {
    return "Combinado, desculpa o incômodo. Não mando mais neste número. Se puder, me passa o WhatsApp do(a) proprietário(a) que eu falo direto com ele(a).";
  }

  if (askedIfOwner(history) && (NOT_OWNER.test(spoken) || /^(nao|naum|n)\b/.test(msg))) {
    return "Sem problema. Pode me passar o WhatsApp do proprietário ou da proprietária? Assim eu não te incomodo mais.";
  }

  if (clientAskedPrice(spoken)) {
    const quote = quoteEntryPrices(offers);
    if (!askedIfOwner(history)) {
      return `${quote} Antes: você é o proprietário ou a proprietária do estabelecimento?`;
    }
    return `${quote} Se quiser, em 10 minutos te mostro o que sobe no ar e como o WhatsApp passa a trabalhar por você.`;
  }

  const objection = matchObjection(spoken);
  if (objection && objection.id !== "obj_preco" && objection.id !== "obj_sem_interesse") {
    return objection.getAutonomousResponse({
      clientName: name || (law ? "Dra." : "oi"),
      companyName: "vocês",
      niche: nicheLabel,
    });
  }

  if (!askedIfOwner(history)) {
    if (IS_OWNER.test(spoken) || /^(sim|sou|eu mesmo|eu mesma)\b/.test(msg)) {
      if (law) {
        return `${hi}perfeito. Enquanto você está no fórum, quem busca advogado na região no Google precisa achar o escritório — não o concorrente. Topa 10 minutos pra eu te mostrar o caminho (site + WhatsApp), sem compromisso?`;
      }
      return `${hi}perfeito. Quem te busca na região no Google precisa te achar fácil. Topa 10 minutos pra eu te mostrar o caminho, sem compromisso?`;
    }
    return law
      ? `${hi}obrigado pelo áudio/retorno. Só pra não te tomar tempo: você é a responsável pelo escritório?`
      : `${hi}obrigado pelo retorno. Só para não te tomar tempo à toa: você é o proprietário ou a proprietária do estabelecimento?`;
  }

  if (IS_OWNER.test(spoken) || /^(sim|sou|eu mesmo|eu mesma|certo|isso)\b/.test(msg)) {
    return law
      ? "Show. Sem enrolação: avaliações boas no mapa sem site próprio é cliente indo pro concorrente. Em 10 minutos te mostro a prévia e o WhatsApp trabalhando. Prefere hoje à tarde ou amanhã de manhã?"
      : "Show. Sem enrolação: vocês ainda não aparecem bem quando alguém busca o serviço na região. Topa 10 minutos só para eu te mostrar o caminho, sem compromisso? Prefere hoje ou amanhã?";
  }

  if (/obrigad|ok\b|blz|beleza|combinado|ta bom|tá bom/.test(msg) && agentPitchCount(history) >= 1) {
    return null;
  }

  if (agentPitchCount(history) >= 2) return null;

  return null;
}
