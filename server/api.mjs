// Rotas do servidor HELENA AI. Usado em dois lugares, sempre na mesma porta do site:
//  - desenvolvimento: plugin do Vite (vite.config.ts)
//  - produção / Render: server/index.mjs
import {
  adminProfile, checkLogin, hashWorkspacePassword, issueToken, readToken,
  verifyToken, workspacePasswordMatches,
} from "./auth.mjs";
import { aiProvider, chatCompletion } from "./ai.mjs";
import { evolutionApiKey, handleEvolutionLocal, remoteEvolutionUrl } from "./evolution-bridge.mjs";
import { publishClientSite } from "./dev-publish.mjs";
import { probePublicSite } from "./site-signals.mjs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseCaktoPayload } from "./billing.mjs";
import { tickRpaQueue } from "./rpa-queue.mjs";
import {
  createWorkspaceAccount, dbReady, enqueueRpaJobDb, loadCycle, loadWorkspaceSnapshot, listRpaJobsDb,
  retryRpaJobDb, rpaMonitorDb, saveCycle, saveWorkspaceSnapshot,
  listWorkspaceAccountProfiles, loadAppPreview, latestPaidAppBillingEvent,
  listAppBillingEvents, recordAppBillingEvent, saveAppPreview,
  workspaceAccountById, workspaceAccountByLogin,
} from "./helena-db.mjs";
import { randomUUID } from "node:crypto";

function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.resolve(name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
}
loadLocalEnv();

const VERSION = "1.0.0";
const startedAt = Date.now();
let waModule = null;

async function whatsapp() {
  waModule ??= await import("./whatsapp.mjs");
  return waModule;
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function corsList() {
  const raw = process.env.CORS_ORIGIN || "https://helenaata.vercel.app,https://helenaata.onrender.com,http://localhost:8081";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function originAllowed(req) {
  const list = corsList();
  if (list.includes("*")) return process.env.NODE_ENV !== "production";
  const origin = req.headers.origin || "";
  if (!origin) return true;
  return list.includes(origin);
}

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function cors(req, res) {
  securityHeaders(res);
  const origin = req.headers.origin || "";
  const list = corsList();
  if (list.includes("*") && process.env.NODE_ENV !== "production") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const match = list.includes(origin) ? origin : "";
    if (match) res.setHeader("Access-Control-Allow-Origin", match);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function isPublicPath(method, p) {
  if (p === "/health" || p === "/api/health") return true;
  if (p === "/api/auth/login" && method === "POST") return true;
  if (p === "/api/auth/register" && method === "POST") return true;
  if (p === "/api/billing/cakto" && method === "POST") return true;
  if (method === "GET" && p.startsWith("/api/previews/")) return true;
  if (p.startsWith("/api/maps/")) return true;
  if (p.startsWith("/api/evolution")) return true;
  return false;
}

async function readJson(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error("Corpo da requisição muito grande.");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const err = new Error("JSON inválido.");
    err.status = 400;
    throw err;
  }
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function sessionToken(req) {
  const authorization = bearer(req);
  if (authorization) return authorization;
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("helena_session="));
  return cookie ? decodeURIComponent(cookie.slice("helena_session=".length)) : "";
}

function setSessionCookie(req, res, token, clear = false) {
  const secure = process.env.NODE_ENV === "production";
  const attributes = [
    "Path=/",
    "HttpOnly",
    secure ? "SameSite=None" : "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    clear ? "Max-Age=0" : "Max-Age=604800",
  ];
  res.setHeader("Set-Cookie", `helena_session=${clear ? "" : encodeURIComponent(token)}; ${attributes.join("; ")}`);
}

function accountProfile(input, id, organizationId, now) {
  return {
    id,
    organizationId,
    name: String(input.name).trim(),
    email: String(input.email).trim().toLowerCase(),
    username: String(input.email).trim().toLowerCase().split("@")[0],
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
    trialEndsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    dailyProspectUsed: 0,
    dailyProspectDate: now.slice(0, 10),
    companyName: String(input.company).trim(),
    phone: String(input.phone || ""),
    evolutionInstance: `h${id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24)}`,
  };
}

async function rpaTenantForSession(session) {
  const user = session.u === "u1" ? adminProfile() : await workspaceAccountById(session.u);
  if (!user) {
    const error = new Error("Conta não encontrada.");
    error.status = 401;
    throw error;
  }
  return {
    appUserId: session.u,
    orgSlug: session.org,
    email: user.email,
    name: user.name,
    companyName: user.companyName,
  };
}

/** Inicia tarefas de fundo (ex.: retomar o WhatsApp salvo). */
export async function startBackground() {
  try {
    (await whatsapp()).resumeIfSaved();
    console.log("[Helena] WhatsApp: sessão salva será retomada se existir creds.json no disco.");
  } catch (e) {
    console.warn("[Helena] WhatsApp indisponível no boot (o site sobe mesmo assim):", e?.message || e);
  }
  setInterval(() => {
    tickRpaQueue().catch((error) => {
      console.error("[Helena RPA] Falha ao processar fila Supabase:", error?.message || error);
    });
  }, 15_000);
}

/**
 * Atende /health e /api/*. Retorna true quando a requisição foi respondida;
 * false para deixar o site (frontend) responder.
 */
export async function handleApi(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const p = url.pathname;
  if (p !== "/health" && !p.startsWith("/api/")) return false;

  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (!originAllowed(req) && !isPublicPath(req.method, p)) {
    send(res, 403, { error: "Origem não autorizada." });
    return true;
  }

  try {
    if (p === "/health" || p === "/api/health") {
      let wa = "unavailable";
      try {
        wa = (await whatsapp()).getStatus().status;
      } catch {
        /* pacote do WhatsApp não instalado */
      }
      const databaseReady = await dbReady();
      const rpaQueue = databaseReady ? (await rpaMonitorDb()).queued : null;
      send(res, 200, {
        status: "ok",
        system: "Helena AI Backend",
        version: VERSION,
        uptime: Math.round((Date.now() - startedAt) / 1000),
        whatsapp: wa,
        ai: aiProvider(),
        evolution: process.env.EVOLUTION_URL && !/localhost|127\.0\.0\.1/.test(process.env.EVOLUTION_URL)
          ? "remote"
          : "baileys-bridge",
        rpaQueue,
        helenaDb: databaseReady ? "postgres" : "unavailable",
      });
      return true;
    }

    if (p === "/api/helena/rpa" && req.method === "GET") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login." }), true;
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      const out = await listRpaJobsDb(await rpaTenantForSession(session));
      send(res, 200, out);
      return true;
    }

    if (p === "/api/helena/rpa/retry" && req.method === "POST") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login." }), true;
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      const body = await readJson(req);
      const out = await retryRpaJobDb(body.id, await rpaTenantForSession(session));
      send(res, out.ok ? 200 : out.error === "não encontrada" ? 404 : 409, out);
      return true;
    }

    if (p === "/api/helena/rpa/monitor" && req.method === "GET") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login." }), true;
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      send(res, 200, {
        ...(await rpaMonitorDb(await rpaTenantForSession(session))),
        helenaDb: "postgres",
      });
      return true;
    }

    if (p === "/api/rpa/enqueue" && req.method === "POST") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login para enfileirar disparo." }), true;
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      const body = await readJson(req);
      if (!body?.number || !body?.text) return send(res, 400, { error: "number e text" }), true;
      const out = await enqueueRpaJobDb({
        ...await rpaTenantForSession(session),
        instance: body.instance,
        number: body.number,
        text: body.text,
        delayMs: body.delayMs,
      });
      send(res, out.ok ? 200 : out.status || 429, out);
      return true;
    }

    if (p === "/api/rpa/jobs" && req.method === "GET") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login." }), true;
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      send(res, 200, await listRpaJobsDb(await rpaTenantForSession(session)));
      return true;
    }

    const OVERPASS = [
      "https://overpass.openstreetmap.fr/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.osm.ch/api/interpreter",
      "https://overpass-api.de/api/interpreter",
    ];
    const MAPS_UA = "HelenaProspecting/1.0 (Info Tech Ltda)";

    if (p === "/api/maps/overpass" && req.method === "POST") {
      const { ql } = await readJson(req);
      if (!ql || typeof ql !== "string") return send(res, 400, { error: "Informe a consulta Overpass." }), true;
      let lastErr = "Overpass indisponível";
      for (const endpoint of OVERPASS) {
        try {
          const r = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              Accept: "application/json",
              "User-Agent": MAPS_UA,
            },
            body: `data=${encodeURIComponent(ql)}`,
            signal: AbortSignal.timeout(40_000),
          });
          const text = await r.text();
          if (!r.ok) {
            lastErr = `HTTP ${r.status}`;
            continue;
          }
          const json = JSON.parse(text);
          send(res, 200, json);
          return true;
        } catch (e) {
          lastErr = e?.message || lastErr;
        }
      }
      send(res, 502, { error: lastErr, elements: [] });
      return true;
    }

    if (p === "/api/maps/geocode" && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      if (!q.trim()) return send(res, 400, { error: "Informe a cidade." }), true;
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`, {
        headers: { Accept: "application/json", "User-Agent": MAPS_UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return send(res, 502, { error: `Photon HTTP ${r.status}` }), true;
      const data = await r.json();
      const feats = Array.isArray(data?.features) ? data.features : [];
      const city = feats.find((f) => /city|town|municipality/i.test(String(f?.properties?.type || f?.properties?.osm_value || "")));
      send(res, 200, { ...data, features: city ? [city, ...feats.filter((f) => f !== city)] : feats });
      return true;
    }

    if (p === "/api/maps/photon" && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      const lat = url.searchParams.get("lat") || "";
      const lon = url.searchParams.get("lon") || "";
      const limit = url.searchParams.get("limit") || "20";
      if (!q.trim()) return send(res, 400, { error: "Informe a busca." }), true;
      const u = new URL("https://photon.komoot.io/api/");
      u.searchParams.set("q", q);
      u.searchParams.set("limit", limit);
      u.searchParams.set("lang", "pt");
      if (lat) u.searchParams.set("lat", lat);
      if (lon) u.searchParams.set("lon", lon);
      const r = await fetch(u, {
        headers: { Accept: "application/json", "User-Agent": MAPS_UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return send(res, 502, { error: `Photon HTTP ${r.status}` }), true;
      send(res, 200, await r.json());
      return true;
    }

    if (p === "/api/billing/cakto" && req.method === "POST") {
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      const body = await readJson(req, 500_000);
      const expected = process.env.CAKTO_WEBHOOK_SECRET || "";
      if (process.env.NODE_ENV === "production" && !expected) {
        return send(res, 503, { error: "CAKTO_WEBHOOK_SECRET não configurada no servidor." }), true;
      }
      if (expected) {
        const got = String(body?.secret || req.headers["x-webhook-secret"] || url.searchParams.get("secret") || "");
        if (got !== expected) return send(res, 401, { error: "Webhook Cakto recusado." }), true;
      }
      const row = parseCaktoPayload(body);
      await recordAppBillingEvent(row);
      send(res, 200, { ok: true, email: row.email, planId: row.planId, paid: row.paid });
      return true;
    }

    if (p === "/api/billing/events" && req.method === "GET") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login." }), true;
      if (session.u !== "u1") return send(res, 403, { error: "Acesso restrito ao administrador." }), true;
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      send(res, 200, { events: await listAppBillingEvents(80) });
      return true;
    }

    if (p === "/api/billing/status" && req.method === "GET") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login." }), true;
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
      const user = session.u === "u1" ? adminProfile() : await workspaceAccountById(session.u);
      if (!user) return send(res, 401, { error: "Conta não encontrada." }), true;
      const row = await latestPaidAppBillingEvent(user.email);
      send(res, 200, { planId: row?.planId || "", paid: Boolean(row), at: row?.at || "" });
      return true;
    }

    if (p === "/api/prospect/site-signals" && req.method === "POST") {
      const { url: siteUrl } = await readJson(req);
      if (!siteUrl) return send(res, 400, { error: "Informe a URL." }), true;
      try {
        send(res, 200, await probePublicSite(siteUrl));
      } catch (e) {
        send(res, 200, { ok: false, hit: false, signals: [], error: e?.message || "Falha ao ler o site" });
      }
      return true;
    }

    if (p === "/api/dev/publish-client" && req.method === "POST") {
      if (!verifyToken(sessionToken(req))) return send(res, 401, { error: "Faça login para publicar." }), true;
      const body = await readJson(req, 2_000_000);
      const preview = body.preview || body;
      if (!preview?.slug || !preview?.name) return send(res, 400, { error: "Prévia inválida." }), true;
      try {
        const result = await publishClientSite(preview);
        send(res, result.ok ? 200 : 400, result);
      } catch (e) {
        send(res, 500, { ok: false, error: e?.message || "Falha no deploy." });
      }
      return true;
    }

    if (p === "/api/previews" && req.method === "POST") {
      const session = readToken(sessionToken(req));
      if (!session) return send(res, 401, { error: "Faça login para salvar prévias." }), true;
      const body = await readJson(req, 2_000_000);
      const list = Array.isArray(body.previews) ? body.previews : body.preview ? [body.preview] : [body];
      const slugs = [];
      for (const preview of list.slice(0, 50)) {
        if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
          return send(res, 400, { error: "Cada prévia deve ser um objeto válido." }), true;
        }
        slugs.push((await saveAppPreview(session.org, preview)).slug);
      }
      send(res, 200, { ok: true, slugs });
      return true;
    }

    if (p.startsWith("/api/previews/") && req.method === "GET") {
      const slug = decodeURIComponent(p.slice("/api/previews/".length).split("/")[0] || "");
      const preview = await loadAppPreview(slug);
      if (!preview) return send(res, 404, { error: "Prévia não encontrada." }), true;
      send(res, 200, { preview });
      return true;
    }

    if (p.startsWith("/api/evolution/") || p === "/api/evolution") {
      const rest = p.slice("/api/evolution".length) || "/";
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const payload = hasBody ? await readJson(req) : {};
      const remote = remoteEvolutionUrl();
      if (!remote) {
        await handleEvolutionLocal(rest, req.method, payload, send, res);
        return true;
      }
      const key = evolutionApiKey(req);
      const target = `${remote}${rest}${url.search}`;
      const r = await fetch(target, {
        method: req.method,
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: hasBody ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(25_000),
      });
      const text = await r.text();
      res.statusCode = r.status;
      res.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(text);
      return true;
    }

    if (p === "/api/auth/login" && req.method === "POST") {
      const { username, password } = await readJson(req);
      let user = null;
      if (checkLogin(username, password)) {
        user = adminProfile();
      } else {
        if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível para login de clientes." }), true;
        const account = await workspaceAccountByLogin(String(username || "").trim());
        if (account && await workspacePasswordMatches(password, account.password_hash)) user = account.profile;
      }
      if (!user) return send(res, 401, { error: "Usuário ou senha inválidos." }), true;
      const token = issueToken(Date.now(), { userId: user.id, organizationId: user.organizationId });
      setSessionCookie(req, res, token);
      send(res, 200, { user });
      return true;
    }

    if (p === "/api/auth/register" && req.method === "POST") {
      if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível. Configure DATABASE_URL no servidor." }), true;
      const input = await readJson(req, 32_000);
      const name = String(input.name || "").trim();
      const company = String(input.company || "").trim();
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      if (name.length < 2 || company.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return send(res, 400, { error: "Informe nome, empresa e um e-mail válido." }), true;
      }
      if (password.length < 8) return send(res, 400, { error: "A senha precisa ter pelo menos 8 caracteres." }), true;
      const id = `u_${randomUUID().replace(/-/g, "")}`;
      const organizationId = `org_${randomUUID().replace(/-/g, "")}`;
      const now = new Date().toISOString();
      const user = accountProfile({ name, company, email, phone: input.phone }, id, organizationId, now);
      try {
        const savedUser = await createWorkspaceAccount({
          user,
          passwordHash: await hashWorkspacePassword(password),
        });
        const token = issueToken(Date.now(), { userId: id, organizationId });
        setSessionCookie(req, res, token);
        send(res, 201, { user: savedUser || user });
      } catch (error) {
        if (error?.code === "23505") return send(res, 409, { error: "Já existe uma conta com este e-mail." }), true;
        throw error;
      }
      return true;
    }

    // Todas as rotas privadas exigem uma sessão assinada.
    const session = readToken(sessionToken(req));
    if (!session) {
      send(res, 401, { error: "Faça login para usar o servidor." });
      return true;
    }

    const route = `${req.method} ${p}`;
    switch (route) {
      case "GET /api/auth/me":
        if (session.u !== "u1" && !(await dbReady())) {
          return send(res, 503, { error: "Banco Supabase indisponível." }), true;
        }
        {
          const user = session.u === "u1" ? adminProfile() : await workspaceAccountById(session.u);
          if (!user) {
            setSessionCookie(req, res, "", true);
            return send(res, 401, { error: "Conta não encontrada." }), true;
          }
          send(res, 200, { ok: true, user, organizationId: session.org });
        }
        return true;
      case "GET /api/workspace": {
        if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
        const result = await loadWorkspaceSnapshot(session.org);
        const accounts = session.u === "u1" ? await listWorkspaceAccountProfiles() : [];
        send(res, 200, { ...result, accounts, organizationId: session.org });
        return true;
      }
      case "PUT /api/workspace": {
        if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
        const body = await readJson(req, 20_000_000);
        if (!body.snapshot || typeof body.snapshot !== "object" || Array.isArray(body.snapshot)) {
          return send(res, 400, { error: "Snapshot do workspace inválido." }), true;
        }
        if (body.snapshot.organization?.id !== session.org) {
          return send(res, 403, { error: "O workspace não pertence à sessão autenticada." }), true;
        }
        if (session.u !== "u1" && (body.snapshot.users || []).some((user) => user.organizationId !== session.org)) {
          return send(res, 403, { error: "O workspace contém usuários de outra organização." }), true;
        }
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) {
          return send(res, 400, { error: "Revisão do workspace inválida." }), true;
        }
        const snapshot = structuredClone(body.snapshot);
        for (const user of snapshot.users || []) {
          delete user.password;
          delete user.passwordHash;
        }
        const accountProfiles = session.u === "u1"
          ? (snapshot.users || []).filter((user) => user.id !== "u1")
          : (snapshot.users || []).filter((user) => user.id === session.u);
        const revision = await saveWorkspaceSnapshot(session.org, snapshot, body.revision, accountProfiles);
        if (revision == null) return send(res, 409, { error: "O workspace foi alterado em outro dispositivo. Recarregue os dados antes de continuar." }), true;
        send(res, 200, { ok: true, revision });
        return true;
      }
      case "POST /api/auth/logout":
        setSessionCookie(req, res, "", true);
        send(res, 200, { ok: true });
        return true;
      case "POST /api/helena/cycle": {
        if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
        const body = await readJson(req, 2_000_000);
        body.tenant = {
          ...(body.tenant || {}),
          appUserId: session.u,
          orgSlug: session.org,
        };
        const out = await saveCycle(body);
        send(res, out.ok ? 200 : 503, out);
        return true;
      }
      case "GET /api/helena/cycle": {
        if (!(await dbReady())) return send(res, 503, { error: "Banco Supabase indisponível." }), true;
        const out = await loadCycle({ appUserId: session.u });
        send(res, 200, out);
        return true;
      }
      case "GET /api/whatsapp/status":
        send(res, 200, (await whatsapp()).getStatus());
        return true;
      case "POST /api/whatsapp/connect":
        send(res, 200, await (await whatsapp()).connect());
        return true;
      case "POST /api/whatsapp/logout":
        send(res, 200, await (await whatsapp()).logout());
        return true;
      case "GET /api/whatsapp/messages":
        send(res, 200, { messages: (await whatsapp()).getMessages() });
        return true;
      case "POST /api/whatsapp/send": {
        const { to, text } = await readJson(req);
        if (!to || !text) return send(res, 400, { error: "Informe o número e a mensagem." }), true;
        send(res, 200, await (await whatsapp()).sendText(to, text));
        return true;
      }
      case "POST /api/whatsapp/auto-reply": {
        const { enabled } = await readJson(req);
        send(res, 200, { autoReply: (await whatsapp()).setAutoReply(enabled) });
        return true;
      }
      case "POST /api/ai/chat": {
        const body = await readJson(req);
        if (!Array.isArray(body.messages)) return send(res, 400, { error: "Campo messages é obrigatório." }), true;
        const { messages, tools, tool_choice, temperature, max_tokens } = body;
        send(res, 200, await chatCompletion({ messages, tools, tool_choice, temperature, max_tokens }));
        return true;
      }
      default:
        send(res, 404, { error: "Rota não encontrada." });
        return true;
    }
  } catch (e) {
    console.error("[Helena API]", e?.status || 500);
    const status = e?.status || 500;
    send(res, status, { error: status >= 500 ? "Erro interno." : (e?.message || "Pedido recusado.") });
    return true;
  }
}
