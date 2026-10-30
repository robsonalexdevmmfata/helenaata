// Cliente do servidor HELENA AI (pasta server/). Por padrão o servidor roda no
// mesmo endereço do site (mesma porta). Defina VITE_API_URL para usar outro endereço.
import { useEffect, useState } from "react";

import { helenaApiBases } from "@/lib/api-origin";

const TOKEN_KEY = "helena-backend-token";

export class BackendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function getBackendToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function clearBackendToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const token = getBackendToken();
  const headers = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const method = init.method ?? (init.body ? "POST" : "GET");
  const body = init.body ? JSON.stringify(init.body) : undefined;
  let last: Error = new BackendError("Servidor WhatsApp indisponível. Rode npm run dev na porta 8081.", 0);

  for (const base of helenaApiBases()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 45_000);
    try {
      const res = await fetch(`${base}${path}`, { method, signal: controller.signal, headers, body });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : null;
      if (!isJson) {
        last = new BackendError("Servidor WhatsApp indisponível. Rode npm run dev na porta 8081.", 0);
        continue;
      }
      if (!res.ok) throw new BackendError(data?.error ?? `Erro ${res.status}`, res.status);
      return data as T;
    } catch (e) {
      if (e instanceof BackendError && e.status !== 0) throw e;
      last = e instanceof Error ? e : last;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

export interface BackendHealth {
  status: "ok";
  system: string;
  version: string;
  uptime: number;
  whatsapp: string;
  ai: "groq" | "freellmapi" | null;
}

export function getHealth() {
  return api<BackendHealth>("/health", { timeoutMs: 45_000 });
}

/**
 * Faz login no servidor. Retorna "ok", "invalid" (senha errada no servidor)
 * ou "offline" (servidor não encontrado — o site segue em modo demonstração).
 */
export async function backendLogin(username: string, password: string): Promise<"ok" | "invalid" | "offline"> {
  try {
    const { token } = await api<{ token: string }>("/api/auth/login", { body: { username, password }, timeoutMs: 5000 });
    window.localStorage.setItem(TOKEN_KEY, token);
    return "ok";
  } catch (e) {
    if (e instanceof BackendError && e.status === 401) return "invalid";
    return "offline";
  }
}

/** Verifica periodicamente se o servidor está no ar. */
export function useBackendHealth(intervalMs = 10000) {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    const run = () =>
      getHealth()
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth(null))
        .finally(() => alive && setChecked(true));
    run();
    const t = setInterval(run, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);
  return { health, online: !!health, checked };
}

export interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "awaiting_qr" | "connected";
  qrCode: string | null;
  phone: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  autoReply: boolean;
  aiProvider: string | null;
  hasSavedSession: boolean;
}

export interface WhatsAppLogEntry {
  id: string;
  at: string;
  direction: "in" | "out" | "system";
  jid: string;
  phone?: string;
  name: string;
  text: string;
}

export const whatsappApi = {
  status: () => api<WhatsAppStatus>("/api/whatsapp/status", { timeoutMs: 45_000 }),
  connect: () => api<WhatsAppStatus>("/api/whatsapp/connect", { method: "POST", timeoutMs: 45_000 }),
  logout: () => api<WhatsAppStatus>("/api/whatsapp/logout", { method: "POST", timeoutMs: 20_000 }),
  messages: () => api<{ messages: WhatsAppLogEntry[] }>("/api/whatsapp/messages", { timeoutMs: 20_000 }),
  send: (to: string, text: string) => api<{ ok: boolean }>("/api/whatsapp/send", { body: { to, text }, timeoutMs: 20_000 }),
  autoReply: (enabled: boolean) => api<{ autoReply: boolean }>("/api/whatsapp/auto-reply", { body: { enabled } }),
};

/** Chat de IA pelo servidor (chave guardada no servidor). Retorna null se indisponível. */
export async function serverChatCompletion(body: Record<string, unknown>): Promise<any | null> {
  if (!getBackendToken()) return null;
  try {
    return await api<any>("/api/ai/chat", { body, timeoutMs: 35000 });
  } catch {
    return null;
  }
}
