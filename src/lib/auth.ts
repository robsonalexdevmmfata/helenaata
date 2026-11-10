// Login: tenta a conta local (admin, demo e cadastros). Se o servidor estiver no ar,
// o admin ainda pega token. Sem servidor, o site segue em modo demonstração.
import { authenticateBackend, BackendError, clearBackendToken } from "./backend";
import { activateWorkspaceForUser, getDB, listAccounts, update, upsertAccount } from "./store";
// getDB used after elevatePrivilegedAccount on session start
import { passwordMatches } from "@/lib/security/secrets";

const SESSION_KEY = "helena-session";

export const DEMO_USERNAME = "admin";
export const DEMO_PASSWORD = "320809eu";
export const ADMIN_EMAIL = "robsonalexdev@gmail.com";
/** Alias Manu — mesma liberação total. */
export const ADMIN_EMAIL_ALT = "robsonalexmmfata@gmail.com";
export const CUSTOMER_USERNAME = "demo";
export const CUSTOMER_PASSWORD = "123456";

export function readSessionUserId() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { userId?: string };
    return parsed.userId || "";
  } catch {
    return "";
  }
}

export function startSession(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, at: new Date().toISOString() }));
  activateWorkspaceForUser(userId);
  update((d) => {
    d.currentUserId = userId;
    const u = d.users.find((x) => x.id === userId);
    if (u) u.lastSeen = new Date().toISOString();
  });
  void import("@/lib/saas").then(({ elevatePrivilegedAccount }) => {
    const u = getDB().users.find((x) => x.id === userId);
    if (u) elevatePrivilegedAccount(u);
  });
  void import("@/lib/persist/cycle").then(({ pullCycleIntoStore, installCyclePersistHooks, flushCyclePush }) => {
    installCyclePersistHooks();
    void pullCycleIntoStore().then(() => flushCyclePush());
  });
}

export function findLocalUser(username: string, password: string) {
  const key = username.trim().toLowerCase();
  const users = listAccounts();
  return users.find((u) => {
    if (u.status === "inativo") return false;
    const matchId = u.username.toLowerCase() === key || u.email.toLowerCase() === key;
    if (!matchId) return false;
    if (u.id === "u1" && !u.passwordHash && !u.password) return password === DEMO_PASSWORD;
    return passwordMatches(u, password);
  });
}

export function checkCredentials(username: string, password: string) {
  return Boolean(findLocalUser(username, password));
}

/** Login só de demonstração / contas locais. */
export function login(username: string, password: string) {
  const user = findLocalUser(username, password);
  if (!user) return false;
  startSession(user.id);
  return true;
}

/** Autentica o administrador ou cliente no servidor; credenciais não vêm do cache local. */
export async function loginWithServer(username: string, password: string) {
  try {
    const user = await authenticateBackend(username, password);
    upsertAccount(user);
    startSession(user.id);
    void import("@/lib/saas").then(({ elevatePrivilegedAccount, syncPaidPlanFromCakto }) => {
      elevatePrivilegedAccount(user);
      syncPaidPlanFromCakto(user);
    });
    void import("@/lib/evolution/provision").then(({ provisionEvolutionInstance }) => provisionEvolutionInstance(user, { remote: false }));
    return true;
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) return false;
    throw error;
  }
}

export function logout() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
  clearBackendToken();
  cloudBootstrapped = false;
}

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(SESSION_KEY));
}

let cloudBootstrapped = false;

/** Em todo boot (login OU refresh): puxa Supabase + hooks de persistência. */
export function bootstrapCloudPersist() {
  if (typeof window === "undefined") return;
  void import("@/lib/persist/cycle").then(({ pullCycleIntoStore, installCyclePersistHooks, flushCyclePush }) => {
    installCyclePersistHooks();
    void pullCycleIntoStore().then(() => flushCyclePush());
  });
}

export function syncSessionUser() {
  const id = readSessionUserId();
  if (!id) return;
  const db = getDB();
  const already = db.currentUserId === id && db.users.some((u) => u.id === id);
  if (!already) {
    if (!listAccounts().some((u) => u.id === id)) return;
    activateWorkspaceForUser(id);
  }
  // Refresh também precisa do ciclo — senão Pipeline/Inbox somem e o local vira verdade única.
  if (!cloudBootstrapped) {
    cloudBootstrapped = true;
    bootstrapCloudPersist();
  }
}
