/** Enfileira disparo no worker do Render (espaçamento antiban com a aba fechada). */
export async function enqueueRemoteSend(input: {
  instance?: string;
  number: string;
  text: string;
  delayMs?: number;
}) {
  try {
    const { api } = await import("@/lib/backend");
    return await api<{ ok: boolean; id?: string; runAt?: string; error?: string }>(
      "/api/rpa/enqueue",
      { body: input },
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível enfileirar o envio.",
    };
  }
}
