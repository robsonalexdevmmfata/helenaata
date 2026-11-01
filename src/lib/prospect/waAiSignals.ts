/**
 * Sinais públicos de IA / chatbot no atendimento (site, URL, texto OSM).
 * Não abre o WhatsApp da empresa — é heurística para a varredura.
 */

const VENDOR = [
  "blip.ai",
  "take.net",
  "takeblip",
  "zenvia",
  "360dialog",
  "twilio.com",
  "gupshup",
  "wati.io",
  "chatwoot",
  "botconversa",
  "manychat",
  "landbot",
  "typebot",
  "botmaker",
  "dialogflow",
  "intercom",
  "tidio",
  "jivochat",
  "jivosite",
  "crisp.chat",
  "tawk.to",
  "zendesk",
  "freshchat",
];

const PHRASES = [
  "atendente virtual",
  "assistente virtual",
  "atendimento automatico",
  "atendimento automático",
  "chatbot",
  "chat bot",
  "whatsapp business api",
  "cloud api",
  "ia no whatsapp",
  "inteligencia artificial no whatsapp",
  "inteligência artificial no whatsapp",
  "robo no whatsapp",
  "robô no whatsapp",
  "bot de whatsapp",
  "bot no whatsapp",
];

export type WaAiSignal = { hit: boolean; signals: string[] };

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function detectWhatsAppAiSignals(text: string, url = ""): WaAiSignal {
  const hay = fold(`${text} ${url}`);
  const signals: string[] = [];
  for (const v of VENDOR) {
    if (hay.includes(v)) signals.push(v);
  }
  for (const p of PHRASES) {
    if (hay.includes(fold(p))) signals.push(p);
  }
  if (/whatsapp/.test(hay) && /(chatbot|assistente virtual|atendente virtual|inteligencia artificial|\bia\b)/.test(hay)) {
    if (!signals.includes("whatsapp+ia")) signals.push("whatsapp+ia");
  }
  return { hit: signals.length > 0, signals };
}

export function isNoWhatsAppAiIntent(text: string) {
  const n = fold(text);
  return /sem ia|sem inteligencia|sem chatbot|atendente virtual|ia no whatsapp|bot no whatsapp|inteligencia artificial.*(whatsapp|atend)|whatsapp.*(sem ia|sem bot|humano)/.test(
    n,
  );
}
