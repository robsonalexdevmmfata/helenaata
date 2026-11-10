import type { DB, HelenaMessage } from "@/lib/types";

/** Backup leve do chat da Helena — sobrevive a refresh mesmo se o DB cheio falhar no localStorage. */

const PREFIX = "helena-chat-v1-";

function chatKey(orgId: string) {
  return `${PREFIX}${orgId || "platform"}`;
}

function readRaw(key: string): HelenaMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { messages?: HelenaMessage[] };
    return Array.isArray(parsed?.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function writeRaw(key: string, messages: HelenaMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ savedAt: new Date().toISOString(), messages: messages.slice(-400) }),
    );
  } catch {
    /* quota */
  }
}

export function mergeHelenaMessages(local: HelenaMessage[] = [], remote: HelenaMessage[] = []): HelenaMessage[] {
  const map = new Map<string, HelenaMessage>();
  for (const m of local) {
    if (m?.id) map.set(m.id, m);
  }
  for (const m of remote) {
    if (!m?.id) continue;
    const prev = map.get(m.id);
    map.set(m.id, prev ? { ...prev, ...m, card: m.card ?? prev.card } : m);
  }
  return Array.from(map.values())
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))
    .slice(-400);
}

/** Grava o chat no backup local (chamar a cada mensagem). */
export function persistHelenaChat(db: DB) {
  if (!db?.organization?.id) return;
  writeRaw(chatKey(db.organization.id), db.helenaMessages || []);
}

/** Restaura do backup local se o store veio vazio ou ficou pra trás. */
export function restoreHelenaChat(db: DB): boolean {
  if (!db?.organization?.id) return false;
  const saved = readRaw(chatKey(db.organization.id));
  if (!saved.length) return false;
  const current = db.helenaMessages || [];
  if (!current.length) {
    db.helenaMessages = saved.slice(-400);
    return true;
  }
  const merged = mergeHelenaMessages(current, saved);
  if (merged.length === current.length) return false;
  db.helenaMessages = merged;
  return true;
}

/** Limpa backup (só quando o usuário clica Limpar histórico). */
export function clearHelenaChatBackup(orgId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chatKey(orgId));
  } catch {
    /* ignore */
  }
}
