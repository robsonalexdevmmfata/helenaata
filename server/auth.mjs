// Login simples do servidor: usuário/senha vêm das variáveis de ambiente
// (padrão admin ou e-mail / senha do owner) e o acesso é liberado com um token assinado.
import { createHmac, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function adminUser() {
  return (process.env.ADMIN_USER || "admin").trim().toLowerCase();
}

function adminEmail() {
  return (process.env.ADMIN_EMAIL || "robsonalexdev@gmail.com").trim().toLowerCase();
}

function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV === "production") return "";
  return "320809eu";
}

function secret() {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET precisa estar configurada no ambiente do servidor.");
  }
  return (
    process.env.SESSION_SECRET ||
    createHash("sha256").update(`helena:${adminUser()}:${adminPassword()}`).digest("hex")
  );
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkLogin(username, password) {
  const user = String(username ?? "").trim().toLowerCase();
  const okUser = safeEqual(user, adminUser()) || safeEqual(user, adminEmail());
  return okUser && safeEqual(String(password ?? ""), adminPassword());
}

export function adminProfile() {
  const now = new Date().toISOString();
  const name = String(process.env.ADMIN_NAME || "Robson Alex").trim();
  const email = adminEmail();
  return {
    id: "u1",
    organizationId: "org_novarota",
    name,
    email,
    username: adminUser(),
    role: "owner",
    title: "CEO",
    color: "chart-1",
    status: "ativo",
    workHours: "09:00–18:00",
    goal: 0,
    achieved: 0,
    lastSeen: now,
    createdAt: now,
    kind: "platform",
    planId: "whitelabel",
    companyName: process.env.ADMIN_COMPANY || "Info Tech",
    phone: "",
  };
}

export async function hashWorkspacePassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}

export async function workspacePasswordMatches(password, encoded) {
  const [scheme, saltText, keyText] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const actual = Buffer.from(await scrypt(String(password), Buffer.from(saltText, "base64url"), expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function issueToken(now = Date.now(), session = {}) {
  const payload = Buffer.from(JSON.stringify({
    u: session.userId || "u1",
    org: session.organizationId || "org_novarota",
    exp: now + TOKEN_TTL_MS,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token, now = Date.now()) {
  if (!token || typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.u !== "string" || typeof data.org !== "string" || typeof data.exp !== "number" || data.exp <= now) return false;
    return data;
  } catch {
    return false;
  }
}

export function verifyToken(token, now = Date.now()) {
  return Boolean(readToken(token, now));
}
