// Conexão real com o WhatsApp via Baileys (QR Code), com resposta automática da Helena.
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { formatForWhatsApp, nextStage } from "./formatter.mjs";
import { aiProvider, helenaReply } from "./ai.mjs";

const AUTH_DIR = path.resolve(process.env.WHATSAPP_AUTH_DIR || "data/whatsapp-auth");
const MAX_LOG = 200;

// Singleton no processo (o Vite pode recarregar a configuração sem reiniciar o Node).
const g = globalThis;
const wa = (g.__helenaWhatsApp ??= {
  sock: null,
  status: "disconnected", // disconnected | connecting | awaiting_qr | connected
  qrDataUrl: null,
  phone: null,
  lastConnectedAt: null,
  lastError: null,
  manualStop: false,
  autoReply: String(process.env.HELENA_AUTO_REPLY || "true").toLowerCase() !== "false",
  log: [],
  conversations: new Map(), // jid -> { stage, history: [{role, content}] }
});

const silent = () => {};
const logger = {
  level: process.env.WHATSAPP_LOG_LEVEL || "silent",
  child() {
    return this;
  },
  trace: silent,
  debug: silent,
  info: silent,
  warn: silent,
  error: silent,
  fatal: silent,
};

async function qrDataUrl(text) {
  try {
    const mod = await import("qrcode");
    const QRCode = mod.default ?? mod;
    return await QRCode.toDataURL(text, { margin: 1, width: 280 });
  } catch {
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=1&data=${encodeURIComponent(text)}`;
  }
}

function pushLog(entry) {
  wa.log.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), ...entry });
  if (wa.log.length > MAX_LOG) wa.log.length = MAX_LOG;
}

function jidToPhone(jid) {
  return String(jid || "").split("@")[0].split(":")[0];
}

export function getStatus() {
  return {
    status: wa.status,
    qrCode: wa.status === "awaiting_qr" ? wa.qrDataUrl : null,
    phone: wa.phone,
    lastConnectedAt: wa.lastConnectedAt,
    lastError: wa.lastError,
    autoReply: wa.autoReply,
    aiProvider: aiProvider(),
    hasSavedSession: existsSync(path.join(AUTH_DIR, "creds.json")),
  };
}

export function getMessages() {
  return wa.log;
}

export function setAutoReply(enabled) {
  wa.autoReply = Boolean(enabled);
  return wa.autoReply;
}

export async function connect() {
  if (wa.sock && wa.status !== "disconnected") return getStatus();
  wa.manualStop = false;
  wa.status = "connecting";
  wa.lastError = null;

  const baileys = await import("@whiskeysockets/baileys");
  const makeWASocket = baileys.default?.default ?? baileys.default ?? baileys.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;

  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // usa a versão embutida no pacote
  }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger,
    browser: Browsers?.ubuntu ? Browsers.ubuntu("Helena AI") : ["Helena AI", "Chrome", "1.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  wa.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      wa.status = "awaiting_qr";
      wa.qrDataUrl = await qrDataUrl(qr);
    }
    if (connection === "open") {
      wa.status = "connected";
      wa.qrDataUrl = null;
      wa.lastConnectedAt = new Date().toISOString();
      wa.phone = jidToPhone(sock.user?.id);
      console.log(`[WhatsApp] Conectado como ${wa.phone}`);
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      wa.sock = null;
      wa.status = "disconnected";
      wa.qrDataUrl = null;
      if (code === DisconnectReason.loggedOut) {
        wa.lastError = "Sessão encerrada no celular. Gere um novo QR Code.";
        await rm(AUTH_DIR, { recursive: true, force: true });
        return;
      }
      if (!wa.manualStop) {
        wa.lastError = lastDisconnect?.error?.message || null;
        setTimeout(() => connect().catch((e) => console.error("[WhatsApp] Falha ao reconectar:", e)), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid;
      if (!jid || msg.key.fromMe || jid.endsWith("@g.us") || jid === "status@broadcast") continue;
      const text =
        msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || "";
      if (!text.trim()) continue;
      const name = msg.pushName || jidToPhone(jid);
      pushLog({ direction: "in", jid, phone: jidToPhone(msg.key.remoteJidAlt || jid), name, text });
      handleIncoming(jid, name, text).catch((e) => console.error("[Helena] Erro ao responder:", e));
    }
  });

  return getStatus();
}

async function handleIncoming(jid, name, text) {
  const convo = wa.conversations.get(jid) ?? { stage: "sdr", history: [] };
  wa.conversations.set(jid, convo);
  const previous = convo.stage;
  convo.stage = nextStage(text, convo.stage);

  if (convo.stage === "humano") {
    if (previous !== "humano") pushLog({ direction: "system", jid, name, text: "Cliente pediu atendimento humano. Helena parou de responder." });
    convo.history.push({ role: "user", content: text });
    return;
  }
  if (!wa.autoReply || !aiProvider()) {
    console.warn("[WhatsApp] Mensagem recebida sem resposta automática. Defina GROQ_API_KEY no Render.");
    convo.history.push({ role: "user", content: text });
    return;
  }

  const raw = await helenaReply({ stage: convo.stage, history: convo.history, text, name });
  convo.history.push({ role: "user", content: text });
  const reply = formatForWhatsApp(raw);
  if (!reply) return;

  // Pequena pausa "digitando" para parecer natural e evitar bloqueios.
  try {
    await wa.sock?.sendPresenceUpdate("composing", jid);
  } catch {
    /* ignora */
  }
  await new Promise((r) => setTimeout(r, Math.min(6000, 1500 + reply.length * 25)));
  await sendText(jid, reply, convo.stage);
  convo.history.push({ role: "assistant", content: reply });
  if (convo.history.length > 30) convo.history.splice(0, convo.history.length - 30);
}

export async function sendText(to, text, agent = "manual") {
  if (!wa.sock || wa.status !== "connected") {
    const err = new Error("WhatsApp não está conectado.");
    err.status = 409;
    throw err;
  }
  const body = formatForWhatsApp(text);
  if (!body) {
    const err = new Error("Mensagem vazia.");
    err.status = 400;
    throw err;
  }
  const jid = String(to).includes("@") ? String(to) : `${String(to).replace(/\D/g, "")}@s.whatsapp.net`;
  await wa.sock.sendMessage(jid, { text: body });
  pushLog({ direction: "out", jid, phone: jidToPhone(jid), name: agent, text: body });
  return { ok: true, to: jid };
}

export async function logout() {
  wa.manualStop = true;
  try {
    await wa.sock?.logout();
  } catch {
    /* já desconectado */
  }
  wa.sock = null;
  wa.status = "disconnected";
  wa.qrDataUrl = null;
  await rm(AUTH_DIR, { recursive: true, force: true });
  return getStatus();
}

/** Reconecta sozinho ao iniciar o servidor se já existe uma sessão salva. */
export function resumeIfSaved() {
  if (wa.sock || !existsSync(path.join(AUTH_DIR, "creds.json"))) return;
  connect().catch((e) => console.error("[WhatsApp] Não foi possível retomar a sessão:", e));
}
