/**
 * evolutionapi.ts
 *
 * Serviço de integração com a Evolution API v2.
 * Toda comunicação real com o WhatsApp passa por aqui.
 *
 * Configuração via .env.local:
 *   VITE_EVOLUTION_URL=https://evo.seudominio.com.br  (vazio = WhatsApp do Render)
 *   VITE_EVOLUTION_KEY=sua_global_api_key
 *   VITE_EVOLUTION_INSTANCE=helena
 *
 * Documentação Evolution API: https://doc.evolution-api.com
 */

import { helenaApiBases, helenaApiOrigin, isLocalEvolutionHost } from "@/lib/api-origin";

// ── Config ────────────────────────────────────────────────────────────────────

export interface EvolutionConfig {
  baseUrl: string;       // vazio = Render/Baileys; senão URL da Evolution na VPS
  apiKey: string;        // Global API Key (cabeçalho apikey)
  instance: string;      // Nome da instância (ex: "helena")
}

/** Lê configuração do .env.local (VITE_*). URL vazia = WhatsApp do Render (Baileys). */
export function getEvolutionConfig(): EvolutionConfig {
  const rawUrl = String(
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_EVOLUTION_URL) || "",
  ).trim();
  const baseUrl = isLocalEvolutionHost(rawUrl) ? "" : rawUrl.replace(/\/$/, "");
  const apiKey = String(
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_EVOLUTION_KEY) || "",
  );
  const instance =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_EVOLUTION_INSTANCE) ||
    "helena";
  return { baseUrl, apiKey, instance: canonicalInstance(instance) };
}

/** Instância Evolution Manager (screenshot: Connected, JID 5518981011186). */
export const EVOLUTION_INSTANCE = "helena";

export function canonicalInstance(name?: string) {
  if (!name || /agencia info tech/i.test(name) || /agência info tech/i.test(name)) return EVOLUTION_INSTANCE;
  return name;
}

export const AGENCY_WHATSAPP = {
  id: "wa_agency",
  name: "agência info tech",
  phone: "+55 18 98101-1186",
  instance: EVOLUTION_INSTANCE,
};

export function getAgencyConnection(db: { connections: Array<{ id: string; name: string; status: string; phone: string }> }) {
  return (
    db.connections.find((c) => c.id === AGENCY_WHATSAPP.id) ||
    db.connections.find((c) => /info tech|helena/i.test(c.name)) ||
    db.connections.find((c) => /98101/.test(c.phone)) ||
    db.connections.find((c) => c.status === "online") ||
    db.connections[0]
  );
}

const STORAGE_KEY = "helena_evolution_config";

/** Lê config salva no localStorage (permite override pela UI) */
export function getEvolutionConfigUI(): EvolutionConfig {
  const env = getEvolutionConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as EvolutionConfig;
      const merged = { ...env, ...saved, instance: canonicalInstance(saved.instance || env.instance) };
      if (isLocalEvolutionHost(merged.baseUrl)) merged.baseUrl = "";
      if (saved.instance !== merged.instance || saved.baseUrl !== merged.baseUrl) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
      }
      return merged;
    }
  } catch {}
  return env;
}

export function saveEvolutionConfigUI(cfg: Partial<EvolutionConfig>): EvolutionConfig {
  const current = getEvolutionConfigUI();
  const updated = { ...current, ...cfg, instance: canonicalInstance(cfg.instance ?? current.instance) };
  if (isLocalEvolutionHost(updated.baseUrl)) updated.baseUrl = "";
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  return updated;
}

// ── Headers helper ───────────────────────────────────────────────────────────

function headers(cfg: EvolutionConfig) {
  return {
    "Content-Type": "application/json",
    apikey: cfg.apiKey,
  };
}

function evoUrl(path: string, _cfg: EvolutionConfig) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const origin = helenaApiBases()[0] ?? helenaApiOrigin();
  return `${origin}/api/evolution${clean}`;
}

export function jidToPhone(jid: string) {
  const id = String(jid || "").replace(/@.*/, "");
  if (!id || id === "0" || /@g\.us$/.test(jid) || /@lid$/.test(jid) || !/^\d+$/.test(id)) return "";
  return id.startsWith("55") ? `+${id}` : `+55${id}`;
}

export function extractWaText(raw: any): string {
  const m = raw?.message ?? raw;
  const text = String(
    m?.conversation ??
      m?.extendedTextMessage?.text ??
      m?.imageMessage?.caption ??
      m?.videoMessage?.caption ??
      m?.documentMessage?.caption ??
      m?.buttonsResponseMessage?.selectedDisplayText ??
      "",
  );
  return text.replace(/\uFFFD/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

export function waTimestampISO(ts: unknown) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n > 1e12 ? n : n * 1000).toISOString();
}

async function evoJson(path: string, init: RequestInit, cfg?: EvolutionConfig) {
  const config = cfg ?? getEvolutionConfigUI();
  const res = await fetch(evoUrl(path, config), {
    ...init,
    headers: { ...headers(config), ...(init.headers as Record<string, string> | undefined) },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export async function evolutionFindChats(cfg?: EvolutionConfig) {
  const config = cfg ?? getEvolutionConfigUI();
  const { ok, data } = await evoJson(`/chat/findChats/${encodeURIComponent(config.instance)}`, {
    method: "POST",
    body: "{}",
  }, config);
  if (!ok) return { ok: false as const, chats: [] as any[], error: `HTTP` };
  const chats = Array.isArray(data) ? data : data?.chats ?? data?.data ?? [];
  return { ok: true as const, chats };
}

export async function evolutionFindContacts(cfg?: EvolutionConfig) {
  const config = cfg ?? getEvolutionConfigUI();
  const { ok, data } = await evoJson(`/chat/findContacts/${encodeURIComponent(config.instance)}`, {
    method: "POST",
    body: "{}",
  }, config);
  if (!ok) return { ok: false as const, contacts: [] as any[], error: "HTTP" };
  const contacts = Array.isArray(data) ? data : data?.contacts ?? data?.data ?? [];
  return { ok: true as const, contacts };
}

export async function evolutionFindChatMessages(remoteJid: string, count = 40, cfg?: EvolutionConfig) {
  const config = cfg ?? getEvolutionConfigUI();
  const { ok, data } = await evoJson(`/chat/findMessages/${encodeURIComponent(config.instance)}`, {
    method: "POST",
    body: JSON.stringify({ where: { key: { remoteJid } }, page: 1, offset: count }),
  }, config);
  if (!ok) return { ok: false as const, messages: [] as any[] };
  let records =
    data?.messages?.records ??
    data?.messages ??
    (Array.isArray(data) ? data : []);
  if (!Array.isArray(records)) records = [];
  if (records.length === 0) {
    const all = await evolutionListAllMessages(cfg);
    records = all.filter((m) => (m?.key?.remoteJid ?? m?.remoteJid) === remoteJid);
  }
  return { ok: true as const, messages: records };
}

export async function evolutionListAllMessages(cfg?: EvolutionConfig, maxPages = 6) {
  const config = cfg ?? getEvolutionConfigUI();
  const out: any[] = [];
  let pages = 1;
  for (let page = 1; page <= Math.min(pages, maxPages); page++) {
    const { ok, data } = await evoJson(`/chat/findMessages/${encodeURIComponent(config.instance)}`, {
      method: "POST",
      body: JSON.stringify({ page, offset: 50 }),
    }, config);
    if (!ok) break;
    const rec = data?.messages?.records ?? (Array.isArray(data) ? data : []);
    pages = Number(data?.messages?.pages ?? pages);
    if (Array.isArray(rec)) out.push(...rec);
    if (!rec.length) break;
  }
  return out;
}

// ── Tipos de resposta ────────────────────────────────────────────────────────

export interface EvoSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  raw?: unknown;
}

export interface EvoStatusResult {
  ok: boolean;
  connected: boolean;
  instance?: string;
  number?: string;
  status?: string;
  error?: string;
}

export interface EvoWebhookResult {
  ok: boolean;
  error?: string;
}

// ── 1. Verificar status da instância ─────────────────────────────────────────

/**
 * Verifica se a instância está conectada ao WhatsApp.
 * GET /instance/connectionState/{instance}
 */
export async function getEvolutionStatus(
  cfg?: EvolutionConfig
): Promise<EvoStatusResult> {
  const config = cfg ?? getEvolutionConfigUI();
  const url = evoUrl(`/instance/connectionState/${config.instance}`, config);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: headers(config),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      return { ok: false, connected: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();

    // Evolution API v2 retorna: { instance: { instanceName, state } }
    const state: string = data?.instance?.state ?? data?.state ?? "close";
    const connected = state === "open";

    return {
      ok: true,
      connected,
      instance: config.instance,
      number: data?.instance?.owner ?? data?.owner ?? "",
      status: state,
    };
  } catch (err: any) {
    return {
      ok: false,
      connected: false,
      error: err?.message ?? "Sem conexão com Evolution API",
    };
  }
}

// ── 2. Enviar mensagem de texto ───────────────────────────────────────────────

/**
 * Envia mensagem de texto via Evolution API.
 * POST /message/sendText/{instance}
 *
 * @param number  - Número no formato E.164 sem + (ex: "5518981011186")
 * @param text    - Texto limpo (sem emojis/markdown — use formatForWhatsApp() antes)
 * @param cfg     - Config opcional (usa getEvolutionConfigUI() por padrão)
 */
export async function evolutionSendText(
  number: string,
  text: string,
  cfg?: EvolutionConfig
): Promise<EvoSendResult> {
  const config = cfg ?? getEvolutionConfigUI();
  if (typeof process !== "undefined" && process.env?.VITEST) {
    return { ok: false, error: "VITEST: disparo WhatsApp desativado" };
  }

  const cleanNumber = number.replace(/\D/g, "");
  let last = "Falha ao enviar mensagem";

  for (const origin of helenaApiBases()) {
    try {
      const res = await fetch(`${origin}/api/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: cleanNumber, text }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        return { ok: true, messageId: data.to ?? "sent", raw: data };
      }
      if (res.status === 409) {
        return { ok: false, error: data?.error ?? "WhatsApp desconectado. Escaneie o QR em Integrações." };
      }
      last = data?.error ?? `HTTP ${res.status}`;
    } catch (err: any) {
      last = err?.message ?? last;
    }

    try {
      const res = await fetch(evoUrl(`/message/sendText/${config.instance}`, config), {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({ number: cleanNumber, text, delay: 1200, linkPreview: false }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        return { ok: true, messageId: data?.key?.id ?? data?.id ?? "sent", raw: data };
      }
      last = data?.message ?? data?.error ?? `HTTP ${res.status}`;
    } catch (err: any) {
      last = err?.message ?? last;
    }
  }

  return { ok: false, error: last };
}

// ── 3. Enviar mídia (imagem/arquivo) ─────────────────────────────────────────

/**
 * Envia arquivo/imagem via Evolution API.
 * POST /message/sendMedia/{instance}
 */
export async function evolutionSendMedia(
  number: string,
  mediaUrl: string,
  caption: string,
  mediatype: "image" | "document" | "audio" = "image",
  cfg?: EvolutionConfig
): Promise<EvoSendResult> {
  const config = cfg ?? getEvolutionConfigUI();
  const cleanNumber = number.replace(/\D/g, "");
  const url = evoUrl(`/message/sendMedia/${config.instance}`, config);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({
        number: cleanNumber,
        mediatype,
        media: mediaUrl,
        caption,
        delay: 1500,
      }),
    });

    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message ?? `HTTP ${res.status}`, raw: data };
    return { ok: true, messageId: data?.key?.id, raw: data };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
}

// ── 4. Configurar Webhook ─────────────────────────────────────────────────────

/**
 * Configura o webhook da instância para apontar para o n8n / backend.
 * POST /webhook/set/{instance}
 *
 * Chame isso uma vez após conectar o número.
 * O webhook receberá TODOS os eventos: mensagens recebidas, enviadas, status etc.
 */
export async function evolutionSetWebhook(
  webhookUrl: string,
  cfg?: EvolutionConfig
): Promise<EvoWebhookResult> {
  const config = cfg ?? getEvolutionConfigUI();
  const url = evoUrl(`/webhook/set/${config.instance}`, config);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false, // envia todos os eventos no mesmo endpoint
        webhook_base64: false,
        events: [
          "MESSAGES_UPSERT",    // mensagens recebidas/enviadas
          "CONNECTION_UPDATE",  // status da conexão (online/offline)
          "QRCODE_UPDATED",     // QR Code renovado
          "SEND_MESSAGE",       // confirmação de envio
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
}

// ── 5. Obter Webhook atual ────────────────────────────────────────────────────

export async function evolutionGetWebhook(
  cfg?: EvolutionConfig
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const config = cfg ?? getEvolutionConfigUI();
  const url = evoUrl(`/webhook/find/${config.instance}`, config);

  try {
    const res = await fetch(url, { method: "GET", headers: headers(config) });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, url: data?.url ?? data?.webhook?.url ?? "" };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
}

// ── 6. Buscar mensagens recebidas (fetch) ─────────────────────────────────────

/**
 * Busca as últimas mensagens de um número específico.
 * GET /chat/findMessages/{instance}?number={number}
 */
export async function evolutionFindMessages(
  number: string,
  count = 20,
  cfg?: EvolutionConfig
): Promise<{ ok: boolean; messages?: any[]; error?: string }> {
  const config = cfg ?? getEvolutionConfigUI();
  const cleanNumber = number.replace(/\D/g, "");
  const url = evoUrl(`/chat/findMessages/${config.instance}?number=${cleanNumber}&count=${count}`, config);

  try {
    const res = await fetch(url, { method: "GET", headers: headers(config) });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, messages: Array.isArray(data) ? data : data?.messages ?? [] };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
}

// ── 7. Testar conexão ────────────────────────────────────────────────────────

/**
 * Testa rapidamente se a Evolution API está acessível e a instância conectada.
 * Retorna latência em ms.
 */
function wipeLocalEvolutionUrl() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !/localhost|127\.0\.0\.1/.test(raw)) return;
    const parsed = JSON.parse(raw) as EvolutionConfig;
    parsed.baseUrl = "";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

async function pingWhatsAppBackend(): Promise<EvoStatusResult> {
  let last = "sem resposta";
  for (const origin of helenaApiBases()) {
    const url = `${origin}/api/whatsapp/status`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) {
        last = `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json().catch(() => null);
      if (!data || typeof data.status !== "string") {
        last = "resposta inválida";
        continue;
      }
      return {
        ok: true,
        connected: data.status === "connected",
        instance: "helena",
        number: data.phone || "",
        status: data.status || "disconnected",
      };
    } catch (err: any) {
      last = err?.message ?? "sem resposta";
    }
  }
  return { ok: false, connected: false, error: last };
}

export async function testEvolutionConnection(
  cfg?: EvolutionConfig
): Promise<{ ok: boolean; connected: boolean; latencyMs: number; message: string; number?: string }> {
  wipeLocalEvolutionUrl();
  const start = Date.now();
  const config = { ...(cfg ?? getEvolutionConfigUI()) };
  if (isLocalEvolutionHost(config.baseUrl)) config.baseUrl = "";
  const baileys = await pingWhatsAppBackend();
  const latencyMs = Date.now() - start;
  if (baileys.ok) {
    if (!baileys.connected) {
      return {
        ok: true,
        connected: false,
        latencyMs,
        message: `Baileys no ar. WhatsApp ainda sem QR (state: ${baileys.status}). Clique em Gerar QR / Conectar.`,
        number: baileys.number,
      };
    }
    return {
      ok: true,
      connected: true,
      latencyMs,
      message: `Conectado via Baileys! Número: ${baileys.number} · ${latencyMs}ms`,
      number: baileys.number,
    };
  }

  if (config.baseUrl) {
    const status = await getEvolutionStatus(config);
    if (status.ok) {
      return {
        ok: true,
        connected: status.connected,
        latencyMs: Date.now() - start,
        message: status.connected
          ? `Conectado! Número: ${status.number} · Latência: ${Date.now() - start}ms`
          : `API online mas WhatsApp desconectado (state: ${status.status}). Escaneie o QR Code.`,
        number: status.number,
      };
    }
  }

  return {
    ok: false,
    connected: false,
    latencyMs,
    message: `WhatsApp (Baileys) não respondeu (${baileys.error}). No PC: npm run dev e use http://localhost:8081. Sem isso o QR não existe.`,
  };
}

// ── 8. Parser de webhook recebido ────────────────────────────────────────────

/**
 * Normaliza o payload do webhook da Evolution API para o formato interno da Helena.
 * Use no handler do n8n ou no endpoint Express que recebe os eventos.
 */
export interface IncomingWhatsAppMessage {
  from: string;           // Número do remetente (ex: "5518981011186")
  fromName?: string;      // Nome do contato (se disponível)
  text: string;           // Texto da mensagem
  messageId: string;      // ID da mensagem no WhatsApp
  timestamp: number;      // Unix timestamp
  isGroup: boolean;       // Se é mensagem de grupo
  instance: string;       // Nome da instância Evolution
}

export function parseEvolutionWebhook(payload: any): IncomingWhatsAppMessage | null {
  try {
    // Evolution API v2 - evento MESSAGES_UPSERT
    const msg = payload?.data?.message ?? payload?.message;
    if (!msg) return null;

    // Ignora mensagens enviadas por nós mesmos
    if (msg?.key?.fromMe === true) return null;

    // Ignora eventos que não são de mensagem
    const event = payload?.event ?? payload?.data?.event;
    if (event && event !== "messages.upsert" && event !== "MESSAGES_UPSERT") return null;

    const jid: string = msg?.key?.remoteJid ?? "";
    if (!jid) return null;

    // Extrai o número limpo (remove @s.whatsapp.net ou @g.us)
    const from = jid.replace(/@s\.whatsapp\.net$/, "").replace(/@g\.us$/, "");
    const isGroup = jid.endsWith("@g.us");

    // Extrai o texto
    const text =
      msg?.message?.conversation ??
      msg?.message?.extendedTextMessage?.text ??
      msg?.message?.buttonsResponseMessage?.selectedButtonId ??
      msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ??
      "";

    if (!text.trim()) return null;

    return {
      from,
      fromName: msg?.pushName ?? undefined,
      text: text.trim(),
      messageId: msg?.key?.id ?? "",
      timestamp: msg?.messageTimestamp ?? Date.now() / 1000,
      isGroup,
      instance: payload?.instance ?? "helena",
    };
  } catch {
    return null;
  }
}
