import { evolutionGetMediaBase64, hasWaAudio } from "./evolutionapi";

/** Transcreve áudio WhatsApp (Evolution → Groq Whisper no servidor). */
export async function transcribeWhatsAppAudio(rawMessage: Record<string, unknown>): Promise<string | null> {
  if (!hasWaAudio(rawMessage) && !hasWaAudio({ message: rawMessage })) return null;
  const mediaMsg =
    (rawMessage as { key?: unknown; message?: unknown }).key != null
      ? rawMessage
      : { key: (rawMessage as any).key, message: (rawMessage as any).message ?? rawMessage };

  const media = await evolutionGetMediaBase64(mediaMsg as { key?: unknown; message?: unknown });
  if (!media.ok) return null;

  const res = await fetch("/api/ai/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base64: media.base64,
      mimetype: media.mimetype,
      fileName: media.fileName || "audio.ogg",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const text = String(data?.text || "").trim();
  return text || null;
}

export function formatAudioTranscript(transcript: string | null): string {
  if (!transcript) return "[Áudio]";
  return `[Áudio] ${transcript}`;
}
