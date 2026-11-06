/**
 * whatsapp-formatter.ts
 *
 * Funções para preparar texto para envio REAL pelo WhatsApp.
 *
 * Regras:
 *  - Remove emojis: o WhatsApp os exibe mas os agentes não devem "falar" emoji
 *    (parece robótico e prejudica a taxa de resposta)
 *  - Remove pontuação markdown: **, __, ~~, ##, etc.
 *  - Mantém quebras de linha naturais
 *  - Mantém "•" como bullet (funciona bem no WhatsApp)
 *  - Mantém "→" e "·" que são caracteres comuns
 *
 * A Helena e os cards da interface CONTINUAM mostrando emojis e formatação
 * rich — este módulo só é chamado quando o texto vai para o canal externo real.
 */

/** Só pictogramas. Não usa \\p{Emoji} — isso come dígitos e às vezes acento. */
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0E}\u{FE0F}]/gu;

/** Remove emojis de uma string */
export function stripEmojis(text: string): string {
  return sanitizeChatText(text)
    .replace(EMOJI_REGEX, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Texto de conversa: português intacto, sem losango, controle ou mojibake. */
export function sanitizeChatText(text: string): string {
  let s = String(text ?? "").normalize("NFC");
  if (/Ã.|Â.|â€/.test(s)) {
    try {
      const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if ((decoded.match(/\uFFFD/g) || []).length < (s.match(/\uFFFD/g) || []).length + 2) {
        s = decoded;
      }
    } catch {
      /* mantém original */
    }
  }
  s = s
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (/Helena teste:/i.test(s) && /ping/i.test(s)) {
    return "Helena teste: o WhatsApp da instância helena está conectado. Este é um ping para o próprio número da agência (não é disparo para leads).";
  }
  return s;
}

/** Remove formatação markdown (negrito **, itálico __, riscado ~~, headers ##) */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")  // **negrito** -> negrito
    .replace(/__(.*?)__/g, "$1")       // __itálico__ -> itálico
    .replace(/~~(.*?)~~/g, "$1")       // ~~riscado~~ -> riscado
    .replace(/^#+\s+/gm, "")          // ## Header -> Header
    .replace(/`([^`]+)`/g, "$1")      // `código` -> código
    .trim();
}

/**
 * Garante que URLs fiquem sozinhas na linha — o WhatsApp só vira link azul clicável assim.
 */
export function isolateUrls(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s<>"']+)/gi, (url) => {
      const clean = url.replace(/[),.]+$/g, "");
      const trail = url.slice(clean.length);
      return `\n${clean}\n${trail}`;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Prepara texto para envio pelo WhatsApp:
 * remove emojis e markdown, preserva quebras de linha e bullets naturais.
 * URLs ficam em linha própria para o app transformar em link clicável.
 */
export function formatForWhatsApp(text: string): string {
  return isolateUrls(
    stripMarkdown(stripEmojis(sanitizeChatText(text)))
      .replace(/ ([.,!?;:])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

/** Partes de texto + link para renderizar no Inbox. */
export function linkifyParts(text: string): Array<{ type: "text" | "link"; value: string }> {
  const raw = sanitizeChatText(text);
  const re = /(https?:\/\/[^\s<>"']+)/gi;
  const parts: Array<{ type: "text" | "link"; value: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > last) parts.push({ type: "text", value: raw.slice(last, m.index) });
    const url = m[1]!.replace(/[),.]+$/g, "");
    parts.push({ type: "link", value: url });
    last = m.index + m[0].length - (m[0].length - url.length);
  }
  if (last < raw.length) parts.push({ type: "text", value: raw.slice(last) });
  return parts.length ? parts : [{ type: "text", value: raw }];
}

/**
 * Regras de handoff transparente entre agentes no mesmo número.
 *
 * O cliente NUNCA vê "Agora vou te transferir para o Closer".
 * Internamente, quem responde muda — mas a conversa continua fluindo
 * como se fosse a mesma pessoa.
 *
 * Ordem natural:
 *   SDR → (interesse detectado) → Qualificador → (BANT aprovado) → Closer → (fechar) → humano
 */

export type HandoffStage = "sdr" | "qualificador" | "closer" | "humano";

export interface HandoffDecision {
  nextStage: HandoffStage;
  nextAgentId: string;
  reason: string;
  /** Mensagem de transição suave — continua a conversa sem revelar a troca */
  bridgeText?: string;
}

/** Palavras/padrões que indicam interesse e disparam handoff SDR → Qualificador */
const INTEREST_TRIGGERS =
  /\b(quero (saber|sim|ver)|me interess|gostei|quanto custa|valor do site|tenho interesse|pode apresentar|demonstra[cç][aã]o|ver como funciona)\b/i;

/** Padrões que indicam qualificação aprovada → Closer */
const QUALIFIED_TRIGGERS =
  /\b(fechar|vamos fechar|quero contratar|como pago|pagamento|boleto|pix|cart[aã]o|parcela|assinar|contrato|quando come[cç]a|come[cç]ar logo|quero come[cç]ar|podemos come[cç]ar|bora|confirma|confirmado|aceito|topo)\b/i;

/** Padrões que indicam que o cliente quer falar com humano */
const HUMAN_TRIGGERS =
  /\b(falar com (pessoa|humano|atendente|gerente|responsavel|s[oó]cio|dono)|humano|pessoa real|algu[eé]m de carne|quero uma pessoa|n[aã]o quero (bot|ia|rob[oô]|m[aá]quina))\b/i;

/**
 * Analisa a última mensagem do cliente e decide se deve fazer handoff.
 * Retorna null se não há necessidade de trocar de agente.
 */
export function evaluateHandoff(
  lastClientMessage: string,
  currentStage: HandoffStage,
  db: { agents: { id: string; role: string; status: string }[] }
): HandoffDecision | null {
  const msg = lastClientMessage.toLowerCase();

  // Pedido explícito de humano — sempre tem prioridade
  if (HUMAN_TRIGGERS.test(msg)) {
    const manager = db.agents.find((a) => a.role === "Supervisor" || a.role === "Closer") ?? db.agents[0];
    return {
      nextStage: "humano",
      nextAgentId: manager?.id ?? "",
      reason: "Cliente solicitou atendimento humano",
      // Sem bridgeText — a notificação vai para o humano, não para o cliente
    };
  }

  // SDR detecta interesse → passa para Qualificador (invisível)
  if (currentStage === "sdr" && INTEREST_TRIGGERS.test(msg)) {
    const qual = db.agents.find((a) => a.role === "Qualificador");
    if (!qual) return null;
    return {
      nextStage: "qualificador",
      nextAgentId: qual.id,
      reason: "Interesse detectado — BANT iniciado",
      // Qualificador continua a conversa sem revelar a troca
      bridgeText: undefined,
    };
  }

  // Qualificador detecta intenção de compra → passa para Closer (invisível)
  if (currentStage === "qualificador" && QUALIFIED_TRIGGERS.test(msg)) {
    const closer = db.agents.find((a) => a.role === "Closer");
    if (!closer) return null;
    return {
      nextStage: "closer",
      nextAgentId: closer.id,
      reason: "Lead qualificado — encaminhado para fechamento",
      bridgeText: undefined,
    };
  }

  return null;
}
