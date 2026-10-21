// Mock authentication (frontend only). Replace with calls to your own API later.
const SESSION_KEY = "helena-session";

export const DEMO_USERNAME = "admin";
export const DEMO_PASSWORD = "123456";

export function checkCredentials(username: string, password: string) {
  return username.trim().toLowerCase() === DEMO_USERNAME && password === DEMO_PASSWORD;
}

export function login(username: string, password: string) {
  if (!checkCredentials(username, password)) return false;
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId: "u1", at: new Date().toISOString() }),
  );
  return true;
}

export function logout() {
  window.localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(SESSION_KEY));
}
