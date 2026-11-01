import type { User } from "@/lib/types";
import { currentUser, patchUserEverywhere } from "@/lib/store";
import { isPlatformAdmin } from "@/lib/saas";
import {
  getEvolutionConfigUI,
  saveEvolutionConfigUI,
  type EvolutionConfig,
} from "./evolutionapi";

/** Nome válido na Evolution: h + id da conta. */
export function instanceNameForUser(userId: string) {
  const id = String(userId || "x")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  return `h${id || "x"}`;
}

export function bindUserEvolutionInstance(user: User | null | undefined) {
  if (!user || isPlatformAdmin(user)) {
    saveEvolutionConfigUI({ instance: "helena" });
    return "helena";
  }
  const name = user.evolutionInstance || instanceNameForUser(user.id);
  if (user.evolutionInstance !== name) {
    patchUserEverywhere(user.id, (u) => {
      u.evolutionInstance = name;
    });
  }
  saveEvolutionConfigUI({ instance: name });
  return name;
}

export async function evolutionCreateInstance(instance: string, cfg?: EvolutionConfig) {
  const config = cfg ?? getEvolutionConfigUI();
  const url =
    typeof window !== "undefined"
      ? "/api/evolution/instance/create"
      : `${config.baseUrl.replace(/\/$/, "")}/instance/create`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok || res.status === 403 || res.status === 409) {
    return { ok: true, instance, existed: res.status === 403 || res.status === 409, raw: data };
  }
  return {
    ok: false,
    instance,
    error: String(data?.message || data?.error || `HTTP ${res.status}`),
  };
}

export async function provisionEvolutionInstance(user: User) {
  if (!user || isPlatformAdmin(user)) {
    bindUserEvolutionInstance(user);
    return { ok: true, instance: "helena", skipped: true };
  }
  if (typeof process !== "undefined" && process.env?.VITEST) {
    const name = instanceNameForUser(user.id);
    patchUserEverywhere(user.id, (u) => {
      u.evolutionInstance = name;
    });
    return { ok: true, instance: name, skipped: true };
  }
  const name = bindUserEvolutionInstance(user);
  return evolutionCreateInstance(name);
}

export function applyLoggedEvolutionInstance() {
  const user = currentUser();
  if (user) bindUserEvolutionInstance(user);
}
