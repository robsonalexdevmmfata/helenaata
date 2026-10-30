import {
  evolutionFindChatMessages,
  evolutionFindChats,
  evolutionFindContacts,
  evolutionListAllMessages,
  extractWaText,
  getAgencyConnection,
  jidToPhone,
  parseEvolutionWebhook,
  waTimestampISO,
} from "./evolutionapi";
import { processEvolutionWebhook } from "./webhookHandler";
import { getDB, nowISO, uid, update } from "@/lib/store";
import { sanitizeChatText } from "@/lib/helena/whatsapp-formatter";

const SEEN_KEY = "helena_evo_seen_ids";
const BOOT_KEY = "helena_evo_bootstrapped";

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
  const list = [...set].slice(-800);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function skipJid(jid: string) {
  if (!jid) return true;
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return true;
  if (jid.startsWith("0@") || jid.startsWith("status@")) return true;
  return false;
}

function phoneKey(phone: string) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d;
}

function displayName(pushName: string | undefined, jid: string, phone: string) {
  const name = String(pushName || "").trim();
  if (name && name !== "Você") return name;
  if (phone) return phone;
  return jid.replace(/@.*/, "") || "WhatsApp";
}

function upsertFromEvolution(opts: {
  remoteJid: string;
  pushName?: string;
  text: string;
  fromMe: boolean;
  messageId: string;
  at: string;
  unread?: number;
}) {
  const db = getDB();
  const user = db.users.find((u) => u.id === db.currentUserId);
  const isPlatform = user?.kind === "platform" || user?.id === "u1";
  if (!isPlatform) {
    const own = getAgencyConnection(db);
    if (!own || own.status !== "online" || !String(own.phone || "").replace(/\D/g, "")) return;
  }
  const phone = jidToPhone(opts.remoteJid);
  const name = displayName(opts.pushName, opts.remoteJid, phone);
  const conn = getAgencyConnection(db);
  const sdr = db.agents.find((a) => a.role === "SDR") ?? db.agents[0];
  const pk = phoneKey(phone || opts.remoteJid);

  let contact = pk
    ? db.contacts.find((c) => phoneKey(c.phone) === pk)
    : db.contacts.find((c) => db.conversations.some((x) => x.contactId === c.id && x.remoteJid === opts.remoteJid));

  const contactId = contact?.id ?? uid("p_evo_");
  if (!contact) {
    update((d) => {
      d.contacts.unshift({
        id: contactId,
        organizationId: d.organization.id,
        name,
        email: "",
        phone: phone || opts.remoteJid,
        title: "WhatsApp",
        tags: ["evolution"],
        source: "WhatsApp",
        ownerId: sdr?.id ?? d.currentUserId,
        status: "lead",
        score: 40,
        consent: true,
        createdAt: nowISO(),
        lastContactAt: opts.at,
      });
    });
    contact = getDB().contacts.find((c) => c.id === contactId);
  } else if (name && contact.name.startsWith("Contato ")) {
    update((d) => {
      const ct = d.contacts.find((c) => c.id === contactId);
      if (ct) ct.name = name;
    });
  }

  let conv = getDB().conversations.find((c) => c.remoteJid === opts.remoteJid)
    ?? getDB().conversations.find((c) => c.contactId === contactId && c.channel === "whatsapp")
    ?? (pk
      ? getDB().conversations.find((c) => {
          const ct = getDB().contacts.find((x) => x.id === c.contactId);
          return c.channel === "whatsapp" && ct && phoneKey(ct.phone) === pk;
        })
      : undefined);

  const msgId = opts.messageId ? `evo_${opts.messageId}` : uid("m_evo_");
  if (!conv) {
    update((d) => {
      d.conversations.unshift({
        id: uid("conv_evo_"),
        organizationId: d.organization.id,
        contactId: contactId,
        channel: "whatsapp",
        connectionId: conn?.id,
        remoteJid: opts.remoteJid,
        status: "aberta",
        handlerType: "agent",
        handlerId: sdr?.id ?? d.currentUserId,
        unread: opts.fromMe ? 0 : (opts.unread ?? 1),
        sentiment: "neutro",
        lastMessageAt: opts.at,
        flow: /Robson Alex|Info Tech/i.test(opts.text)
          ? { origin: "prospeccao" as const, state: "abordado" as const, lastOutboundAt: opts.at, closerAttempts: 0 }
          : undefined,
        messages: opts.text
          ? [{
              id: msgId,
              from: opts.fromMe ? "agent" : "contact",
              authorName: opts.fromMe ? (sdr?.name ?? "Helena") : name,
              text: opts.text,
              at: opts.at,
              kind: "text",
            }]
          : [],
      });
    });
    return;
  }

  update((d) => {
    const c = d.conversations.find((x) => x.id === conv!.id);
    if (!c) return;
    c.remoteJid = opts.remoteJid;
    if (!c.lastMessageAt || +new Date(opts.at) >= +new Date(c.lastMessageAt)) c.lastMessageAt = opts.at;
    if (!opts.fromMe) c.unread = opts.unread ?? c.unread;
    if (opts.text && !c.messages.some((m) => m.id === msgId || (m.text === opts.text && Math.abs(+new Date(m.at) - +new Date(opts.at)) < 2000))) {
      c.messages.push({
        id: msgId,
        from: opts.fromMe ? (c.handlerType === "human" ? "human" : "agent") : "contact",
        authorName: opts.fromMe ? (sdr?.name ?? "Helena") : name,
        text: opts.text,
        at: opts.at,
        kind: "text",
      });
      c.messages.sort((a, b) => +new Date(a.at) - +new Date(b.at));
    }
    if (opts.fromMe && /Robson Alex|Info Tech/i.test(opts.text) && !c.flow) {
      c.flow = { origin: "prospeccao", state: "abordado", lastOutboundAt: opts.at, closerAttempts: 0 };
    } else if (c.flow && opts.fromMe && opts.text) {
      c.flow.lastOutboundAt = opts.at;
    } else if (c.flow && !opts.fromMe && opts.text) {
      c.flow.repliedAt = opts.at;
      c.flow.state = c.flow.state === "closer" || c.flow.state === "reuniao_agendada" ? c.flow.state : "respondeu";
    }
    const ct = d.contacts.find((x) => x.id === contactId);
    if (ct) {
      ct.lastContactAt = opts.at;
      if (phone) ct.phone = phone;
    }
  });
}

export async function hydrateConversationFromEvolution(conversationId: string) {
  const conv = getDB().conversations.find((c) => c.id === conversationId);
  if (!conv?.remoteJid) return;
  const res = await evolutionFindChatMessages(conv.remoteJid, 50);
  if (!res.ok) return;
  const sdr = getDB().agents.find((a) => a.id === conv.handlerId);
  update((d) => {
    const c = d.conversations.find((x) => x.id === conversationId);
    if (!c) return;
    const existing = new Set(c.messages.map((m) => m.id));
    const mapped = res.messages
      .map((raw) => {
        const key = raw?.key ?? {};
        const id = String(key.id ?? raw?.id ?? "");
        const text = sanitizeChatText(extractWaText(raw));
        if (!id || !text) return null;
        return {
          id: `evo_${id}`,
          from: (key.fromMe ? "agent" : "contact") as "agent" | "contact",
          authorName: key.fromMe ? (sdr?.name ?? "Helena") : (raw?.pushName || "Contato"),
          text,
          at: waTimestampISO(raw?.messageTimestamp),
          kind: "text" as const,
        };
      })
      .filter(Boolean) as typeof c.messages;
    for (const m of mapped) {
      if (!existing.has(m.id)) {
        c.messages.push(m);
        existing.add(m.id);
      }
    }
    c.messages.sort((a, b) => +new Date(a.at) - +new Date(b.at));
    const last = c.messages.at(-1);
    if (last) c.lastMessageAt = last.at;
  });
}

/**
 * Espelha chats/contatos da Evolution no Inbox (estilo Chatwoot).
 * Na primeira carga só importa histórico. Mensagens novas inbound disparam o agente.
 */
export async function pollEvolutionInbox(): Promise<number> {
  const db = getDB();
  const user = db.users.find((u) => u.id === db.currentUserId);
  const isPlatform = user?.kind === "platform" || user?.id === "u1";
  if (!isPlatform) {
    const own = getAgencyConnection(db);
    if (!own || own.status !== "online" || !String(own.phone || "").replace(/\D/g, "")) return 0;
  }
  const chatsRes = await evolutionFindChats().catch(() => ({ ok: false as const, chats: [] as any[] }));
  const contactsRes = await evolutionFindContacts().catch(() => ({ ok: false as const, contacts: [] as any[] }));
  if (!chatsRes.ok && !contactsRes.ok) return 0;

  const boot = typeof window !== "undefined" && localStorage.getItem(BOOT_KEY) === "1";
  const known = seenIds();
  let ingested = 0;

  for (const ct of contactsRes.contacts ?? []) {
    const jid = String(ct?.remoteJid ?? "");
    if (skipJid(jid)) continue;
    upsertFromEvolution({
      remoteJid: jid,
      pushName: ct?.pushName,
      text: "",
      fromMe: true,
      messageId: `contact_${jid}`,
      at: waTimestampISO(Date.parse(String(ct?.updatedAt ?? "")) || Date.now()),
      unread: 0,
    });
  }

  try {
    const all = await evolutionListAllMessages();
    for (const raw of all) {
      const key = raw?.key ?? {};
      const jid = String(key.remoteJid ?? "");
      if (skipJid(jid)) continue;
      const text = sanitizeChatText(extractWaText(raw));
      const id = String(key.id ?? raw?.id ?? "");
      if (!text) continue;
      const fromMe = Boolean(key.fromMe);
      upsertFromEvolution({
        remoteJid: jid,
        pushName: raw?.pushName,
        text,
        fromMe,
        messageId: id || `hist_${jid}`,
        at: waTimestampISO(raw?.messageTimestamp),
        unread: 0,
      });
      if (id) remember(id);
    }
  } catch (err) {
    console.warn("[Inbox] histórico Evolution", err);
  }

  for (const chat of chatsRes.chats ?? []) {
    const jid = String(chat?.remoteJid ?? chat?.id ?? "");
    if (skipJid(jid)) continue;
    const last = chat?.lastMessage ?? chat?.message ?? {};
    const key = last?.key ?? chat?.key ?? {};
    const id = String(key.id ?? last?.id ?? "");
    const text = sanitizeChatText(extractWaText(last));
    const fromMe = Boolean(key.fromMe);
    upsertFromEvolution({
      remoteJid: jid,
      pushName: chat?.pushName ?? last?.pushName,
      text,
      fromMe,
      messageId: id || `chat_${jid}`,
      at: waTimestampISO(last?.messageTimestamp),
      unread: Number(chat?.unreadCount ?? 0),
    });
    if (!id || fromMe || !text) {
      if (id) remember(id);
      continue;
    }
    if (!boot || known.has(id)) {
      remember(id);
      continue;
    }
    const tsN = Number(last?.messageTimestamp);
    const tsMs = !Number.isFinite(tsN) || tsN <= 0 ? 0 : tsN > 1e12 ? tsN : tsN * 1000;
    if (tsMs && Date.now() - tsMs > 3 * 60_000) {
      remember(id);
      continue;
    }
    remember(id);
    ingested += 1;
    const payload = {
      event: "MESSAGES_UPSERT",
      instance: "helena",
      data: {
        message: {
          key: { ...key, remoteJid: jid, fromMe: false },
          pushName: chat?.pushName ?? last?.pushName,
          messageTimestamp: last?.messageTimestamp ?? Date.now() / 1000,
          message: { conversation: text },
        },
      },
    };
    if (text && parseEvolutionWebhook(payload)) {
      await processEvolutionWebhook(payload);
    }
  }

  if (!boot && typeof window !== "undefined") {
    localStorage.setItem(BOOT_KEY, "1");
  }
  return ingested;
}

export function startEvolutionInboxPoller(intervalMs = 8000) {
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
