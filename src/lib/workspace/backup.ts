import { getDB } from "@/lib/store";
import type { Contact, DB } from "@/lib/types";

export function exportWorkspaceJson() {
  const db = getDB();
  const safe = {
    ...db,
    users: db.users.map((u) => ({ ...u, password: undefined })),
  };
  return JSON.stringify(safe, null, 2);
}

export function downloadWorkspaceBackup() {
  const blob = new Blob([exportWorkspaceJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `helena-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportContactBundle(db: DB, contact: Contact) {
  return {
    contact,
    deals: db.deals.filter((d) => d.contactId === contact.id),
    conversations: db.conversations.filter((c) => c.contactId === contact.id),
    activities: db.activities.filter((a) => a.contactId === contact.id),
    meetings: (db.meetings ?? []).filter((m) => m.contactId === contact.id),
    exportedAt: new Date().toISOString(),
  };
}
