// Login simples do servidor: usuário/senha vêm das variáveis de ambiente
// (padrão admin ou e-mail / senha do owner) e o acesso é liberado com um token assinado.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

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
  return {
    id: "u1",
    organizationId: "org_novarota",
    name: String(process.env.ADMIN_NAME || "Robson Alex").trim(),
    email: adminEmail(),
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
    lifetimeAccess: true,
  };
}

export function issueToken(now = Date.now(), session = {}) {
  const payload = Buffer.from(JSON.stringify({
    u: session.userId || adminUser(),
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
    if (typeof data.u !== "string" || typeof data.exp !== "number" || data.exp <= now) return false;
    return data;
  } catch {
    return false;
  }
}

export function verifyToken(token, now = Date.now()) {
  return Boolean(readToken(token, now));
}
