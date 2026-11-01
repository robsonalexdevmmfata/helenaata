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
  "chatbot",
  "chat bot",
  "whatsapp business api",
  "ia no whatsapp",
  "inteligencia artificial no whatsapp",
  "robo no whatsapp",
  "bot de whatsapp",
  "bot no whatsapp",
];

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function scanHtmlForWaAi(text, url = "") {
  const hay = fold(`${text} ${url}`);
  const signals = [];
  for (const v of VENDOR) if (hay.includes(v)) signals.push(v);
  for (const p of PHRASES) if (hay.includes(fold(p))) signals.push(p);
  if (/whatsapp/.test(hay) && /(chatbot|assistente virtual|atendente virtual|inteligencia artificial|\bia\b)/.test(hay)) {
    signals.push("whatsapp+ia");
  }
  return { hit: signals.length > 0, signals };
}

function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "::1") return true;
  const ipv4 = h.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (ipv4) {
    const p = h.split(".").map(Number);
    const a = p[0];
    const b = p[1];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export async function probePublicSite(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    return { ok: false, hit: false, signals: [], error: "URL inválida" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, hit: false, signals: [], error: "Só http(s)" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, hit: false, signals: [], error: "Host bloqueado" };
  }
  const fromUrl = scanHtmlForWaAi("", parsed.href);
  if (fromUrl.hit) return { ok: true, ...fromUrl };
  const r = await fetch(parsed.href, {
    headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "HelenaProspecting/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  const buf = await r.arrayBuffer();
  const slice = buf.byteLength > 48_000 ? buf.slice(0, 48_000) : buf;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  return { ok: r.ok, ...scanHtmlForWaAi(html, parsed.href) };
}
