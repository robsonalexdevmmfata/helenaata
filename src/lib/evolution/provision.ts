import type { User } from "@/lib/types";
import { currentUser, getDB, patchUserEverywhere } from "@/lib/store";
import { isPlatformAdmin } from "@/lib/saas";
import {
  getEvolutionConfigUI,
  qrImageFromEvolution,
  saveEvolutionConfigUI,
  type EvolutionConfig,
} from "./evolutionapi";

/** Nome válido na Evolution: só letras e números, minúsculas. */
export function sanitizeInstanceName(raw: string) {
  const ascii = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 32);
  return ascii;
}

/** Nome válido na Evolution: h + id da conta. */
export function instanceNameForUser(userId: string) {
  const id = String(userId || "x")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  return `h${id || "x"}`;
}

export function instanceNameFromLabel(label: string, userId?: string) {
  return sanitizeInstanceName(label) || (userId ? instanceNameForUser(userId) : "");
}

export function bindUserEvolutionInstance(user: User | null | undefined, preferredName?: string) {
  if (!user || isPlatformAdmin(user)) {
    saveEvolutionConfigUI({ instance: "helena" });
    return "helena";
  }
  const name =
    sanitizeInstanceName(preferredName || "") ||
    user.evolutionInstance ||
    instanceNameForUser(user.id);
  if (user.evolutionInstance !== name) {
    patchUserEverywhere(user.id, (u) => {
      u.evolutionInstance = name;
    });
  }
  saveEvolutionConfigUI({ instance: name });
  return name;
}

export interface ProvisionResult {
  ok: boolean;
  instance: string;
  error?: string;
  existed?: boolean;
  skipped?: boolean;
  /** QR já devolvido pela Evolution no /instance/create (data URL). */
  qr?: string;
}

export async function evolutionCreateInstance(
  instance: string,
  cfg?: EvolutionConfig,
): Promise<ProvisionResult> {
  const config = cfg ?? getEvolutionConfigUI();
  const url =
    typeof window !== "undefined"
      ? "/api/evolution/instance/create"
      : `${config.baseUrl.replace(/\/$/, "")}/instance/create`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({
        instanceName: instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
  } catch (err: unknown) {
    return { ok: false, instance, error: err instanceof Error ? err.message : "Sem rede" };
  }
  const data = await res.json().catch(() => ({}));
  const message = String(
    (Array.isArray(data?.response?.message) ? data.response.message.join(" ") : data?.response?.message) ||
      data?.message ||
      data?.error ||
      "",
  );
  if (res.status === 401) {
    return { ok: false, instance, error: "A Evolution recusou a chave (EVOLUTION_KEY no Render)." };
  }
  // Evolution v2 responde 403 "already in use" quando a instância já existe.
  const exists = res.status === 409 || (res.status === 403 && /use|exist/i.test(message));
  if (res.ok || exists) {
    return { ok: true, instance, existed: exists, qr: qrImageFromEvolution(data) };
  }
  return { ok: false, instance, error: message || `HTTP ${res.status}` };
}

export async function provisionEvolutionInstance(
  user: User,
  opts?: { instanceName?: string; remote?: boolean },
): Promise<ProvisionResult> {
  if (!user || isPlatformAdmin(user)) {
    bindUserEvolutionInstance(user);
    return { ok: true, instance: "helena", skipped: true };
  }
  if (typeof process !== "undefined" && process.env?.VITEST) {
    const name =
      sanitizeInstanceName(opts?.instanceName || "") || instanceNameForUser(user.id);
    patchUserEverywhere(user.id, (u) => {
      u.evolutionInstance = name;
    });
    return { ok: true, instance: name, skipped: true };
  }
  const name = bindUserEvolutionInstance(user, opts?.instanceName);
  if (opts?.remote === false) return { ok: true, instance: name, skipped: true };
  return evolutionCreateInstance(name);
}

export function applyLoggedEvolutionInstance() {
  const user = currentUser(getDB());
  if (user) bindUserEvolutionInstance(user);
}
