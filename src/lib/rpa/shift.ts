import type { Contact, Conversation, DB } from "@/lib/types";
import { isOptedOut } from "@/lib/whatsapp/antiban";

export function pickRpaLeads(db: DB, max = 3): Contact[] {
  return db.contacts
    .filter((c) => c.status !== "inativo" && c.phone && !isOptedOut(c))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, Math.max(1, Math.min(5, max)));
}

export function rpaOpening(contact: Contact, companyName?: string) {
  const house = companyName || contact.name;
  return `Oi, aqui é da ${house}. Vi vocês no Google e montei uma prévia de como a casa fica online. Posso te mandar o link? Se não quiser mais mensagem, responde SAIR.`;
}

export function findOrDraftConversation(db: DB, contact: Contact): Conversation | undefined {
  return db.conversations.find((c) => c.contactId === contact.id && c.channel === "whatsapp");
}
