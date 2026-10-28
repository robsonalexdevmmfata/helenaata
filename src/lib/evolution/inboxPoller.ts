import { getEvolutionConfigUI, parseEvolutionWebhook } from "./evolutionapi";
import { processEvolutionWebhook } from "./webhookHandler";

const SEEN_KEY = "helena_evo_seen_ids";

function seenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function remember(id: string) {
  const set = seenIds();
  set.add(id);
  const list = [...set].slice(-400);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Busca chats recentes na Evolution e injeta mensagens novas (fromMe=false)
 * no fluxo dos agentes SDR/Closer.
 */
export async function pollEvolutionInbox(): Promise<number> {
  const cfg = getEvolutionConfigUI();
  if (!cfg.apiKey || !cfg.baseUrl) return 0;

  const url = `${cfg.baseUrl}/chat/findChats/${encodeURIComponent(cfg.instance)}`;
  let chats: any[] = [];
  try {
    const res = await fetch(url, { headers: { apikey: cfg.apiKey } });
    if (!res.ok) return 0;
    const data = await res.json();
    chats = Array.isArray(data) ? data : data?.chats ?? data?.data ?? [];
  } catch {
    return 0;
  }

  let ingested = 0;
  const known = seenIds();

  for (const chat of chats.slice(0, 25)) {
    const last = chat?.lastMessage ?? chat?.message ?? chat;
    const key = last?.key ?? chat?.key;
    if (!key || key.fromMe) continue;
    const id = String(key.id ?? "");
    if (!id || known.has(id)) continue;

    const jid = String(key.remoteJid ?? "");
    if (jid.endsWith("@g.us")) continue;

    const text =
      last?.message?.conversation ??
      last?.message?.extendedTextMessage?.text ??
      last?.conversation ??
      "";
    if (!String(text).trim()) continue;

    remember(id);
    const payload = {
      event: "MESSAGES_UPSERT",
      instance: cfg.instance,
      data: {
        message: {
          key,
          pushName: chat?.pushName ?? last?.pushName,
          messageTimestamp: last?.messageTimestamp ?? Date.now() / 1000,
          message: { conversation: String(text).trim() },
        },
      },
    };
    if (!parseEvolutionWebhook(payload)) continue;
    await processEvolutionWebhook(payload);
    ingested += 1;
  }
  return ingested;
}

export function startEvolutionInboxPoller(intervalMs = 10000) {
  if (typeof window === "undefined") return () => {};
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await pollEvolutionInbox();
    } catch (err) {
      console.warn("[Inbox poller]", err);
    } finally {
      busy = false;
    }
  };
  void tick();
  const id = window.setInterval(tick, intervalMs);
  return () => window.clearInterval(id);
}
