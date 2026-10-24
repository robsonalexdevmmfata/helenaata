// Login simples do servidor: usuário/senha vêm das variáveis de ambiente
// (padrão admin / 123456) e o acesso é liberado com um token assinado.
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function adminUser() {
  return (process.env.ADMIN_USER || "admin").trim().toLowerCase();
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "123456";
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
  return (
    safeEqual(String(username ?? "").trim().toLowerCase(), adminUser()) &&
    safeEqual(String(password ?? ""), adminPassword())
  );
}

export function issueToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: adminUser(), exp: now + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!token || typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.u === adminUser() && typeof data.exp === "number" && data.exp > now;
  } catch {
    return false;
  }
}
