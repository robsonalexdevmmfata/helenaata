import type { ServiceOffer } from "@/lib/types";
import { clientAskedPrice, quoteEntryPrices } from "@/lib/catalog";
import { matchObjection } from "@/lib/helena/sales-brain";
import { previewUrl } from "@/lib/dev/presence";
import { getDB } from "@/lib/store";

/** Regras: pergunta se é dono → se responde/áudio, oferece site + link público. */

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

export const IS_OWNER =
  /^(sou |sim[,.]? )?(o |a )?(dono|dona|proprietari[oa]|socio|socia|responsavel|responsável)\b|\bsim\b.*\b(dono|dona|propriet|respons)|eu (que )?(dono|decido|sou o dono|sou a dona|responsavel)/i;

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

export function agentPitchCount(history: ChatTurn[]) {
  return history.filter(
    (m) => m.from !== "contact" && (/site|landing|google|10 minutos|reuniao|reunião|cardápio|cardapio/i.test(m.text) || /https?:\/\/\S*\/v\//i.test(m.text)),
  ).length;
}

function alreadySentPreviewLink(history: ChatTurn[]) {
  return history.some((m) => m.from !== "contact" && /https?:\/\/\S*\/v\//i.test(m.text));
}

function offerSiteAndLink(firstName: string, niche: string, preview?: InboxPreviewCtx) {
  const name = firstName.replace(/^(dra?\.)\s*/i, "").split(/\s+/)[0] || "";
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

  if (url) {
    return `${hi}perfeito. Montei ${product} pra ${company} — já no ar. Abre o link (é clicável):

${url}

Se gostar, publicamos oficial ainda esta semana. Topa 10 minutos pra eu te mostrar?`;
  }

  return law
    ? `${hi}perfeito. Enquanto você está no fórum, quem busca advogado na região no Google precisa achar o escritório. Topa 10 minutos pra eu te mostrar o site + WhatsApp, sem compromisso?`
    : `${hi}perfeito. Quem te busca na região no Google precisa te achar fácil. Topa 10 minutos pra eu te mostrar o site${withMenu ? " e o cardápio" : ""} no ar, sem compromisso?`;
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
  const name = firstName.replace(/^(dra?\.)\s*/i, "").split(/\s+/)[0] || "";
  const hi = name ? `${name}, ` : "";
  const law = /advog|jurid|escrit/i.test(niche);
  const nicheLabel = law ? "advogado" : niche || "seu serviço";
  const audio = isAudioTurn(clientText);

  if (WRONG_NUMBER.test(spoken) || /nao tenho interesse|pode parar|nao me envie|stop/i.test(spoken)) {
    return "Combinado, desculpa o incômodo. Não mando mais neste número. Se puder, me passa o WhatsApp do(a) proprietário(a) que eu falo direto com ele(a).";
  }

  if (askedIfOwner(history) && (NOT_OWNER.test(spoken) || (/^(nao|naum|n)\b/.test(msg) && !IS_OWNER.test(spoken) && !audio))) {
    return "Sem problema. Pode me passar o WhatsApp do proprietário ou da proprietária? Assim eu não te incomodo mais.";
  }

  if (clientAskedPrice(spoken)) {
    const quote = quoteEntryPrices(offers);
    if (!askedIfOwner(history)) {
      return `${quote} Antes: você é o proprietário, a proprietária ou a pessoa responsável?`;
    }
    if (!alreadySentPreviewLink(history) && preview?.url) {
      return `${quote}

Enquanto isso, olha a prévia que já está no ar:

${preview.url}

Em 10 minutos te mostro o que sobe oficial e como o WhatsApp passa a trabalhar por você.`;
    }
    return `${quote} Se quiser, em 10 minutos te mostro o que sobe no ar e como o WhatsApp passa a trabalhar por você.`;
  }

  const objection = matchObjection(spoken);
  if (objection && objection.id !== "obj_preco" && objection.id !== "obj_sem_interesse") {
    return objection.getAutonomousResponse({
      clientName: name || (law ? "Dra." : "oi"),
      companyName: preview?.companyName || "vocês",
      niche: nicheLabel,
    });
  }

  // Soft close: já pitchou e o lead só agradeceu.
  if (/obrigad|ok\b|blz|beleza|combinado|ta bom|tá bom/.test(msg) && agentPitchCount(history) >= 1) {
    return null;
  }

  // Ainda não perguntou se é dono → pergunta (áudio ou texto).
  if (!askedIfOwner(history)) {
    if (IS_OWNER.test(spoken) || /^(sim|sou|eu mesmo|eu mesma)\b/.test(msg)) {
      return offerSiteAndLink(firstName, niche, preview);
    }
    return law
      ? `${hi}obrigado pelo ${audio ? "áudio" : "retorno"}. Só pra não te tomar tempo: você é a responsável pelo escritório?`
      : `${hi}obrigado pelo ${audio ? "áudio" : "retorno"}. Só para não te tomar tempo à toa: você é o proprietário, a proprietária ou a pessoa responsável?`;
  }

  // Já perguntou: dono confirmou, áudio, ou qualquer engajamento → site + link público.
  if (!alreadySentPreviewLink(history) && agentPitchCount(history) < 2) {
    const engaged =
      IS_OWNER.test(spoken)
      || audio
      || /^(sim|sou|eu mesmo|eu mesma|certo|isso|pode|claro|ok|blz|beleza|opa|fala)\b/.test(msg)
      || (msg.length > 1 && !/^(nao|naum|n)\b/.test(msg));
    if (engaged) return offerSiteAndLink(firstName, niche, preview);
  }

  if (agentPitchCount(history) >= 2) return null;

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
