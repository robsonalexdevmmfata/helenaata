import { api, BackendError } from "./backend";
import {
  activateWorkspaceForUser,
  deactivateWorkspace,
  flushWorkspace,
  listAccounts,
  update,
} from "./store";
import { passwordMatches } from "@/lib/security/secrets";
import type { User } from "./types";
import { toast } from "sonner";

export const DEMO_USERNAME = "admin";
export const DEMO_PASSWORD = "320809eu";
export const ADMIN_EMAIL = "robsonalexdev@gmail.com";
export const CUSTOMER_USERNAME = "demo";
export const CUSTOMER_PASSWORD = "123456";

let activeUserId = "";
let restorePromise: Promise<boolean> | null = null;

export async function startSession(user: User | string) {
  if (typeof user === "string") {
    if (import.meta.env.MODE !== "test") {
      throw new Error("A sessão precisa ser autenticada pelo servidor.");
    }
    activeUserId = user;
    update((db) => {
      db.currentUserId = user;
      const current = db.users.find((entry) => entry.id === user);
      if (current) current.lastSeen = new Date().toISOString();
    });
    return;
  }
  await activateWorkspaceForUser(user);
  activeUserId = user.id;
  update((db) => {
    db.currentUserId = user.id;
    const current = db.users.find((entry) => entry.id === user.id);
    if (current) current.lastSeen = new Date().toISOString();
  });
  void import("@/lib/persist/cycle").then(({ pullCycleIntoStore }) => pullCycleIntoStore());
}

export function findLocalUser(username: string, password: string) {
  if (import.meta.env.MODE !== "test") return undefined;
  const key = username.trim().toLowerCase();
  const users = listAccounts();
  return users.find((user) => {
    if (user.status === "inativo") return false;
    const matchesLogin = user.username.toLowerCase() === key || user.email.toLowerCase() === key;
    if (!matchesLogin) return false;
    if (passwordMatches(user, password)) return true;
    if (user.id === "u1" && password === DEMO_PASSWORD) return true;
    return user.id === "u_demo" && password === CUSTOMER_PASSWORD;
  });
}

export function checkCredentials(username: string, password: string) {
  return Boolean(findLocalUser(username, password));
}

/** Login local existe apenas para os testes unitários; a aplicação autentica no servidor. */
export function login(username: string, password: string) {
  const user = findLocalUser(username, password);
  if (!user) return false;
  void startSession(user.id);
  return true;
}

export async function loginWithServer(username: string, password: string) {
  try {
    const response = await api<{ user: User }>("/api/auth/login", {
      body: { username, password },
      timeoutMs: 10000,
    });
    await startSession(response.user);
    void import("@/lib/saas").then(({ syncPaidPlanFromCakto }) =>
      syncPaidPlanFromCakto(response.user),
    );
    void import("@/lib/evolution/provision").then(({ provisionEvolutionInstance }) =>
      provisionEvolutionInstance(response.user, { remote: false }),
    );
    return true;
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) return false;
    throw error;
  }
}

export async function restoreSession() {
  if (activeUserId) return true;
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    try {
      const response = await api<{ user: User }>("/api/auth/me", { timeoutMs: 10000 });
      await startSession(response.user);
      return true;
    } catch (error) {
      if (!(error instanceof BackendError) || error.status !== 401) {
        toast.error(
          `Não foi possível restaurar a sessão: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
        );
      }
      return false;
    } finally {
      restorePromise = null;
    }
  })();
  return restorePromise;
}

export async function logout() {
  try {
    await flushWorkspace();
  } catch (error) {
    toast.error(
      `Workspace não sincronizado antes de sair: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
    );
  }
  activeUserId = "";
  deactivateWorkspace();
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    toast.error(
      `Não foi possível encerrar a sessão no servidor: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
    );
  }
}
