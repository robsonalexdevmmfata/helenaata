/** Enfileira disparo no worker do Render (espaçamento antiban com a aba fechada). */
export async function enqueueRemoteSend(input: { instance?: string; number: string; text: string; delayMs?: number }) {
  try {
    const { currentUser, getDB } = await import("@/lib/store");
    const db = getDB();
    const user = currentUser(db);
    const res = await fetch("/api/rpa/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        orgSlug: db.organization.id,
        appUserId: user.id,
        email: user.email,
        name: user.name,
      }),
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch {
    return { ok: false };
  }
}
