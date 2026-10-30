// Login: tenta a conta local (admin, demo e cadastros). Se o servidor estiver no ar,
// o admin ainda pega token. Sem servidor, o site segue em modo demonstração.
import { backendLogin, clearBackendToken } from "./backend";
import { getDB, update } from "./store";

const SESSION_KEY = "helena-session";

export const DEMO_USERNAME = "admin";
export const DEMO_PASSWORD = "123456";
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
  update((d) => {
    d.currentUserId = userId;
    const u = d.users.find((x) => x.id === userId);
    if (u) u.lastSeen = new Date().toISOString();
  });
}

export function findLocalUser(username: string, password: string) {
  const key = username.trim().toLowerCase();
  const db = getDB();
  return db.users.find((u) => {
    if (u.status === "inativo") return false;
    const matchId = u.username.toLowerCase() === key || u.email.toLowerCase() === key;
    if (!matchId) return false;
    const pass = u.password || (u.id === "u1" ? DEMO_PASSWORD : "");
    return pass === password;
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

/** Login completo: conta local primeiro; admin ainda tenta o servidor. */
export async function loginWithServer(username: string, password: string) {
  const user = findLocalUser(username, password);
  if (user) {
    startSession(user.id);
    if (user.id === "u1" || user.username === DEMO_USERNAME) {
      const result = await backendLogin(username, password);
      if (result === "invalid") {
        /* token do servidor não veio; a sessão local segue */
      }
    }
    return true;
  }
  const result = await backendLogin(username, password);
  if (result === "ok") {
    startSession("u1");
    return true;
  }
  return false;
}

export function logout() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
  clearBackendToken();
}

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(SESSION_KEY));
}

export function syncSessionUser() {
  const id = readSessionUserId();
  if (!id) return;
  const db = getDB();
  if (db.currentUserId === id) return;
  if (!db.users.some((u) => u.id === id)) return;
  update((d) => {
    d.currentUserId = id;
  });
}
