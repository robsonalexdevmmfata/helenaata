// Cliente do servidor HELENA AI (pasta server/). Por padrão o servidor roda no
// mesmo endereço do site (mesma porta). Defina VITE_API_URL para usar outro endereço.
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";

// Padrão: mesmo endereço do site. Na Vercel, /api e /health são repassados ao Render (vercel.json),
// então o login e o cadastro não dependem de CORS nem de cookie entre domínios.
const BASE = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "helena-backend-token";

export interface BackendSession {
  token: string;
  user: User;
}

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15000);
  try {
    const token = getBackendToken();
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      signal: controller.signal,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json() : null;
    if (!isJson) throw new BackendError("Servidor indisponível.", 0);
    if (!res.ok) throw new BackendError(data?.error ?? `Erro ${res.status}`, res.status);
    return data as T;
  } catch (e) {
    if (e instanceof BackendError) throw e;
    throw new BackendError("Servidor indisponível.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export interface BackendHealth {
  status: "ok";
  system: string;
  version: string;
  uptime: number;
  whatsapp: string;
  ai: "groq" | "freellmapi" | null;
  evolution?: string;
}

export function getHealth() {
  return api<BackendHealth>("/health", { timeoutMs: 4000 });
}

export async function authenticateBackend(username: string, password: string) {
  const session = await api<BackendSession>("/api/auth/login", {
    body: { username, password },
    timeoutMs: 10000,
  });
  if (!session.token || !session.user?.id) {
    throw new BackendError("Resposta de login inválida do servidor.", 502);
  }
  window.localStorage.setItem(TOKEN_KEY, session.token);
  return session.user;
}

export async function registerBackend(input: {
  name: string;
  company: string;
  email: string;
  password: string;
  phone?: string;
}) {
  const session = await api<BackendSession>("/api/auth/register", {
    body: input,
    timeoutMs: 15000,
  });
  if (!session.token || !session.user?.id) {
    throw new BackendError("Resposta de cadastro inválida do servidor.", 502);
  }
  window.localStorage.setItem(TOKEN_KEY, session.token);
  return session.user;
}

/**
 * Faz login no servidor. Retorna "ok", "invalid" (senha errada no servidor)
 * ou "offline" (servidor não encontrado — o site segue em modo demonstração).
 */
export async function backendLogin(username: string, password: string): Promise<"ok" | "invalid" | "offline"> {
  try {
    await authenticateBackend(username, password);
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
  status: () => api<WhatsAppStatus>("/api/whatsapp/status"),
  connect: () => api<WhatsAppStatus>("/api/whatsapp/connect", { method: "POST", timeoutMs: 30000 }),
  logout: () => api<WhatsAppStatus>("/api/whatsapp/logout", { method: "POST" }),
  messages: () => api<{ messages: WhatsAppLogEntry[] }>("/api/whatsapp/messages"),
  send: (to: string, text: string) => api<{ ok: boolean }>("/api/whatsapp/send", { body: { to, text } }),
  autoReply: (enabled: boolean) => api<{ autoReply: boolean }>("/api/whatsapp/auto-reply", { body: { enabled } }),
};

/** Chat de IA pelo servidor (chave Groq no Vercel/Render). Retorna null se indisponível. */
export async function serverChatCompletion(body: Record<string, unknown>): Promise<any | null> {
  try {
    // Não exige token: /api/ai/chat na Vercel usa GROQ_API_KEY do ambiente.
    return await api<any>("/api/ai/chat", { body, timeoutMs: 35000 });
  } catch {
    return null;
  }
}
