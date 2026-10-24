// Prepara textos para envio real pelo WhatsApp e decide o handoff invisível
// entre agentes (SDR -> Qualificador -> Closer -> humano).
// Espelha src/lib/helena/whatsapp-formatter.ts (o servidor roda em Node puro, sem build).

const EMOJI_REGEX = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{FE00}-\u{FE0F}]|\u{200D}/gu;

export function stripEmojis(text) {
  return String(text ?? "")
    .replace(EMOJI_REGEX, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function stripMarkdown(text) {
  return String(text ?? "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function formatForWhatsApp(text) {
  return stripMarkdown(stripEmojis(text))
    .replace(/ ([.,!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const INTEREST =
  /\b(quero|queria|me interess|sim|pode ser|gostei|me mostra|que horas|quanto custa|valor|pre[cç]o|qual seria|tenho interesse|me conta mais|quero saber|me fala|pode apresentar|demonstra[cç][aã]o|ver como funciona)\b/i;
const QUALIFIED =
  /\b(fechar|vamos fechar|quero contratar|como pago|pagamento|boleto|pix|cart[aã]o|parcela|assinar|contrato|quando come[cç]a|quero come[cç]ar|podemos come[cç]ar|bora|confirma|confirmado|aceito|topo)\b/i;
const HUMAN =
  /(falar com (uma )?(pessoa|humano|atendente|gerente|respons[aá]vel|s[oó]cio|dono)|pessoa real|quero uma pessoa|n[aã]o quero (falar com )?(bot|ia|rob[oô]|m[aá]quina))/i;

/** Retorna o próximo estágio da conversa (ou o mesmo, se nada mudou). */
export function nextStage(message, current = "sdr") {
  const msg = String(message ?? "");
  if (current === "humano") return "humano";
  if (HUMAN.test(msg)) return "humano";
  if (current === "sdr" && INTEREST.test(msg)) return "qualificador";
  if ((current === "qualificador" || current === "sdr") && QUALIFIED.test(msg)) return "closer";
  return current;
}
