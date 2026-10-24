// Login: usa o servidor HELENA (pasta server/) quando ele está no ar; sem servidor,
// o site funciona em modo demonstração com o login padrão.
import { backendLogin, clearBackendToken } from "./backend";

const SESSION_KEY = "helena-session";

export const DEMO_USERNAME = "admin";
export const DEMO_PASSWORD = "123456";

export function checkCredentials(username: string, password: string) {
  return username.trim().toLowerCase() === DEMO_USERNAME && password === DEMO_PASSWORD;
}

function startSession() {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: "u1", at: new Date().toISOString() }));
}

/** Login só de demonstração (sem servidor). */
export function login(username: string, password: string) {
  if (!checkCredentials(username, password)) return false;
  startSession();
  return true;
}

/** Login completo: servidor primeiro; se ele estiver fora do ar, cai no modo demonstração. */
export async function loginWithServer(username: string, password: string) {
  const result = await backendLogin(username, password);
  if (result === "ok") {
    startSession();
    return true;
  }
  if (result === "invalid") return false;
  return login(username, password);
}

export function logout() {
  window.localStorage.removeItem(SESSION_KEY);
  clearBackendToken();
}

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(SESSION_KEY));
}
