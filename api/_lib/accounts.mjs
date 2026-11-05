/**
 * Contas no Supabase para as funções /api/auth na Vercel.
 * Sem painel do Render: a DATABASE_URL fica no Environment da Vercel.
 */
import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let pool = null;
let pgTried = false;

function ipv4SupabaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  const match = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (!match) return raw;
  const ref = match[1];
  const user = decodeURIComponent(parsed.username || "postgres");
  const poolUser = user.includes(".") ? user : `${user}.${ref}`;
  const region = String(process.env.SUPABASE_POOLER_REGION || "us-east-1").trim();
  const poolHost = String(process.env.SUPABASE_POOLER_HOST || `aws-0-${region}.pooler.supabase.com`).trim();
  parsed.hostname = poolHost;
  parsed.port = parsed.port === "6543" ? "6543" : "5432";
  parsed.username = poolUser;
  return parsed.toString();
}

async function getPool() {
  if (pool) return pool;
  if (pgTried) return null;
  pgTried = true;
  const url = process.env.DATABASE_URL || "";
  if (!url) return null;
  try {
    const { default: pg } = await import("pg");
    const next = new pg.Pool({
      connectionString: ipv4SupabaseUrl(url),
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 8000,
    });
    await next.query("select 1");
    pool = next;
    return pool;
  } catch (err) {
    console.warn("[vercel-auth] db:", err?.code || err?.message || err);
    return null;
  }
}

export async function dbReady() {
  const p = await getPool();
  if (!p) return false;
  try {
    await p.query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}

async function passwordMatches(password, encoded) {
  const [scheme, saltText, keyText] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(keyText, "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = Buffer.from(await scrypt(String(password), salt, expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function adminUser() {
  return (process.env.ADMIN_USER || "admin").trim().toLowerCase();
}

function adminEmail() {
  return (process.env.ADMIN_EMAIL || "robsonalexdev@gmail.com").trim().toLowerCase();
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function secret() {
  return (
    process.env.SESSION_SECRET ||
    createHash("sha256").update(`helena:${adminUser()}:${adminPassword() || "dev"}`).digest("hex")
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

export function issueToken(session = {}) {
  const payload = Buffer.from(
    JSON.stringify({
      u: session.userId || adminUser(),
      org: session.organizationId || "org_novarota",
      exp: Date.now() + TOKEN_TTL_MS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function checkAdminLogin(username, password) {
  const user = String(username ?? "").trim().toLowerCase();
  const pass = String(password ?? "");
  const pwd = adminPassword();
  if (!pwd) return false;
  const okUser = safeEqual(user, adminUser()) || safeEqual(user, adminEmail());
  return okUser && safeEqual(pass, pwd);
}

export async function findAccount(login) {
  const p = await getPool();
  if (!p) return null;
  const result = await p.query(
    `select app_user_id, app_organization_id, username, email, password_hash, profile
       from public.app_accounts
      where lower(username) = lower($1) or lower(email) = lower($1)
      limit 1`,
    [login],
  );
  return result.rows[0] ?? null;
}

export async function createAccount({ name, company, email, password, phone }) {
  const p = await getPool();
  if (!p) {
    const err = new Error("Supabase indisponível. Configure DATABASE_URL na Vercel.");
    err.status = 503;
    throw err;
  }
  const id = `u_${randomUUID().replace(/-/g, "")}`;
  const organizationId = `org_${randomUUID().replace(/-/g, "")}`;
  const now = new Date().toISOString();
  const user = {
    id,
    organizationId,
    name,
    email,
    username: email,
    role: "owner",
    title: "Dona da conta",
    color: "chart-3",
    status: "ativo",
    workHours: "09:00–18:00",
    goal: 15_000,
    achieved: 0,
    lastSeen: now,
    createdAt: now,
    kind: "customer",
    planId: "trial",
    trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    dailyProspectUsed: 0,
    dailyProspectDate: now.slice(0, 10),
    companyName: company,
    phone: phone || "",
    evolutionInstance: `h${id.slice(2, 26)}`,
  };
  try {
    const result = await p.query(
      `insert into public.app_accounts
         (app_user_id, app_organization_id, username, email, password_hash, profile)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       returning profile`,
      [user.id, user.organizationId, user.username, user.email, await hashPassword(password), JSON.stringify(user)],
    );
    return result.rows[0]?.profile || user;
  } catch (error) {
    if (error?.code === "23505") {
      const err = new Error("Já existe uma conta com este e-mail.");
      err.status = 409;
      throw err;
    }
    if (error?.code === "42P01") {
      const err = new Error("A tabela public.app_accounts não existe. Execute a migration 006 no Supabase.");
      err.status = 503;
      throw err;
    }
    throw error;
  }
}

export async function loginAccount(username, password) {
  if (checkAdminLogin(username, password)) return adminProfile();
  if (!(await dbReady())) {
    const err = new Error("Supabase indisponível. Configure DATABASE_URL na Vercel.");
    err.status = 503;
    throw err;
  }
  const account = await findAccount(String(username || "").trim());
  if (!account || !(await passwordMatches(password, account.password_hash))) return null;
  return account.profile;
}

export function passwordMatchesExport(password, encoded) {
  return passwordMatches(password, encoded);
}
